/**
 * Walks captured transcripts and decides `RETRIEVAL_BAKEOFF.md` §8a's three hard gates per arm.
 *
 * Deliberately offline and free: it reads `eval/transcripts/**` and `eval/fixtures/**`, calls no
 * model and opens no socket, so it is re-runnable after every corpus change — the property that
 * made the retrieval harness useful, applied one layer up (§8b).
 *
 * **It admits nothing about answer quality.** Clearing these three gates means an arm has not
 * invented a figure, has refused where it must, and has not cited a source it was never given. It
 * does not mean the answers are correct; that is the judge's pass, and it runs on survivors.
 */
import fs from "fs";
import path from "path";
import { loadFixtures } from "../fixtures";
import { buildSystemPrompt } from "../../prompt/systemPrompt";
import {
  checkCitations,
  checkFigures,
  checkQuotes,
  checkRefusal,
  REFUSAL_TOLERANCE,
  type RefusalMatch,
} from "./checks";

export const TRANSCRIPT_ROOT = path.join(process.cwd(), "eval", "transcripts");

export interface TurnFinding {
  fixtureId: string;
  fixtureClass: string;
  turn: number;
  gate: "refusal" | "citations" | "figures" | "quotes";
  detail: string;
}

export interface ArmGateResult {
  arm: string;
  pass: string;
  turns: number;
  refusal: {
    required: number;
    exact: number;
    normalized: number;
    tolerance: number;
    /** Refused, but not in the service's words. Passes the gate; a rubric miss for the judge. */
    offContract: number;
    /** Stated a figure on a turn that had to refuse. The only disqualifying outcome. */
    answered: number;
    /** §8a: 100% must **refuse**. Wording deviations are surfaced, never hidden, never vetoing. */
    met: boolean;
  };
  citations: {
    total: number;
    valid: number;
    rate: number;
    /** §8a: >=95% of citations resolve. */
    met: boolean;
  };
  figures: {
    total: number;
    unexplained: number;
    conversions: number;
    /** §8a: zero fabricated figures, absolute. */
    met: boolean;
  };
  /**
   * Quote-backed citations — **measured, never gating.** No `met`, and it is not folded into
   * `gatesMet`: §8a pre-registered three hard gates before any arm ran, and silently adding a
   * fourth would change published per-arm verdicts (§1c) as a side effect of building an
   * instrument. It reads zero on every arm captured before the prompt asks for quotes; that is
   * the expected baseline, not a failure.
   */
  quotes: {
    total: number;
    supported: number;
    short: number;
    /** `supported / total`, or 1 when the arm produced no quotes at all. */
    rate: number;
  };
  gatesMet: boolean;
  findings: TurnFinding[];
}

export interface GateRunOptions {
  pass?: string;
  arms?: string[];
  tolerance?: number;
  root?: string;
}

const CITATION_FLOOR = 0.95;

const readTranscripts = (dir: string): { file: string; body: Record<string, unknown> }[] => (
  fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => ({
        file: name,
        body: JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as Record<string, unknown>,
      }))
    : []
);

/**
 * `fixtureId` -> zero-based turn index -> whether that turn's rubric demands a refusal.
 *
 * Read straight off each turn's `requires_refusal` flag — the only source of truth. There is
 * deliberately no fallback to matching rubric prose: the earlier approach (regex-matching
 * `must_contain` for words like "refuse") is what this replaced, and it matched 0 of wave 1's 8
 * refusal turns because they phrase the same requirement as "Declines to..." and "States that no
 * source here gives...". A silent prose fallback would reintroduce exactly that failure mode.
 *
 * **Throws when a `refusal`-class fixture yields no flagged turn.** The refusal gate is absolute
 * (§8a: 100%), and a map that finds nothing reports `required: 0` and `met: true` — an arm that
 * answered every unanswerable question would clear a pre-registered gate. That is a worse failure
 * than not running, so it is loud.
 */
export const refusalMap = (): Map<string, boolean[]> => {
  const map = new Map<string, boolean[]>();
  const fixtures = loadFixtures();
  fixtures.forEach((fixture) => {
    map.set(fixture.id, fixture.turns.map((turn) => turn.requires_refusal === true));
  });

  const refusalFixtures = fixtures.filter((fixture) => fixture.class === "refusal");
  const detected = refusalFixtures
    .reduce((total, fixture) => total + (map.get(fixture.id) ?? []).filter(Boolean).length, 0);
  if (refusalFixtures.length > 0 && detected === 0) {
    throw new Error(
      `${refusalFixtures.length} refusal-class fixture(s) loaded but no turn sets `
      + "requires_refusal: true, so the refusal gate would pass on zero turns. "
      + "Flag the turns whose rubric admits no substantive answer.",
    );
  }
  return map;
};

export const runGateCheck = (options: GateRunOptions = {}): ArmGateResult[] => {
  const pass = options.pass ?? "warm";
  const tolerance = options.tolerance ?? REFUSAL_TOLERANCE;
  const root = options.root ?? TRANSCRIPT_ROOT;
  const passDir = path.join(root, pass);

  if (!fs.existsSync(passDir)) {
    throw new Error(`No transcripts at ${passDir}. Capture a pass first (npm run bakeoff).`);
  }

  const refusals = refusalMap();
  const arms = (options.arms ?? fs.readdirSync(passDir))
    .filter((arm) => fs.statSync(path.join(passDir, arm)).isDirectory());

  return arms.map((arm) => {
    const result: ArmGateResult = {
      arm,
      pass,
      turns: 0,
      refusal: {
        required: 0,
        exact: 0,
        normalized: 0,
        tolerance: 0,
        offContract: 0,
        answered: 0,
        met: true,
      },
      citations: {
        total: 0, valid: 0, rate: 1, met: true,
      },
      figures: {
        total: 0, unexplained: 0, conversions: 0, met: true,
      },
      quotes: {
        total: 0, supported: 0, short: 0, rate: 1,
      },
      gatesMet: true,
      findings: [],
    };

    readTranscripts(path.join(passDir, arm)).forEach(({ body }) => {
      const fixtureId = String(body.fixtureId);
      const fixtureClass = String(body.fixtureClass ?? "");
      const turns = (body.turns ?? []) as {
        index: number;
        question?: string;
        answer: string;
        context: { id: string; text: string }[];
      }[];
      const requiresRefusal = refusals.get(fixtureId) ?? [];

      turns.forEach((turn, position) => {
        result.turns += 1;
        const evidence = {
          answer: turn.answer,
          context: turn.context ?? [],
          // The system prompt carries the operator normal ranges the answers are *told* to apply,
          // and prior questions carry figures the user supplied. Both are legitimate grounding and
          // neither is in `context`. Built with the sweep's flags — SENSOR_TOOL and REPORT_TOOL
          // off — because that is the prompt the captured arms actually ran against.
          grounding: [
            buildSystemPrompt(undefined, false, false),
            ...turns.slice(0, position + 1).map((prior) => prior.question ?? ""),
          ],
        };
        const label = { fixtureId, fixtureClass, turn: position + 1 };

        if (requiresRefusal[position]) {
          result.refusal.required += 1;
          const outcome = checkRefusal(turn.answer, tolerance);
          const bucket: Record<RefusalMatch, keyof ArmGateResult["refusal"]> = {
            exact: "exact",
            normalized: "normalized",
            tolerance: "tolerance",
            "off-contract": "offContract",
            answered: "answered",
          };
          (result.refusal[bucket[outcome.match]] as number) += 1;

          // Every outcome but `exact` is surfaced, so nobody discovers later that "100%" quietly
          // meant "close enough" — but only `answered` costs the arm the gate.
          if (outcome.match !== "exact") {
            result.findings.push({
              ...label,
              gate: "refusal",
              detail: `${outcome.match}: ${outcome.note}`,
            });
          }
        }

        const quotes = checkQuotes(evidence);
        result.quotes.total += quotes.total;
        result.quotes.supported += quotes.supported;
        result.quotes.short += quotes.short;
        quotes.issues.forEach((issue) => result.findings.push({
          ...label, gate: "quotes", detail: `${issue.marker} ${issue.reason}`,
        }));

        const citations = checkCitations(evidence);
        result.citations.total += citations.total;
        result.citations.valid += citations.valid;
        citations.issues.forEach((issue) => result.findings.push({
          ...label, gate: "citations", detail: `${issue.marker} ${issue.reason}`,
        }));

        const figures = checkFigures(evidence);
        result.figures.total += figures.total;
        figures.issues.forEach((issue) => {
          if (issue.explained) {
            result.figures.conversions += 1;
            return;
          }
          result.figures.unexplained += 1;
          result.findings.push({
            ...label, gate: "figures", detail: `"${issue.value}" not in context — ${issue.context}`,
          });
        });
      });
    });

    result.refusal.met = result.refusal.answered === 0;
    result.citations.rate = result.citations.total === 0
      ? 1
      : result.citations.valid / result.citations.total;
    result.citations.met = result.citations.rate >= CITATION_FLOOR;
    result.figures.met = result.figures.unexplained === 0;
    result.quotes.rate = result.quotes.total === 0
      ? 1
      : result.quotes.supported / result.quotes.total;
    // Deliberately three terms, not four — see the `quotes` field's doc comment.
    result.gatesMet = result.refusal.met && result.citations.met && result.figures.met;

    return result;
  });
};
