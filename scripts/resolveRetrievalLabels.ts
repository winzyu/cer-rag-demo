/**
 * Phase 1e, mechanical half: resolve the claim ids named in each `eval/fixtures-wave1/*.json`
 * fixture's `notes` prose against `eval/claims/*.json`, and emit draft `FixtureLabels`
 * (`src/eval/retrieval/types.ts`) into `eval/retrieval-labels/`.
 *
 * **What this does not do.** It does not run a candidate sweep for chunks the notes never
 * mention, and it does not place hard negatives — both are a later, human pass
 * (`docs/EVAL_REBUILD.md` §1e). A label here is real ground truth only for the claim ids that
 * happen to be named and resolve; everything else is a reported gap, not a guess.
 *
 * A claim id that does not resolve is dropped from the label and reported, never guessed at. A
 * fixture that resolves nothing at all and is not a refusal fixture gets **no label file** —
 * writing `noRelevantChunks` for it would silently tell the harness "nothing is relevant here",
 * which is not a fact this script has any basis to assert.
 *
 * Labels are flat per fixture: every resolved chunk is attached to every turn. The fixture's
 * own contamination methodology (`eval/fixtures-wave1/_EXIT_CRITERIA.md` "Reproducing") already
 * treats the notes' claim-id list as one gold set per fixture rather than per turn, so this
 * matches existing precedent rather than inventing a new one. It is coarser than a hand-split
 * would be — a fixture whose two turns draw from disjoint sources will over-credit recall on
 * each turn — and that coarseness is exactly the kind of thing a human labelling pass exists to
 * tighten.
 *
 *   npx ts-node scripts/resolveRetrievalLabels.ts
 *   npx ts-node scripts/resolveRetrievalLabels.ts --out=eval/retrieval-labels
 */
import fs from "fs";
import path from "path";
import { readCorpus } from "../src/ingestion/ingest";
import { createLogger } from "../src/utils/logger";

const log = createLogger("ResolveRetrievalLabels");

const FIXTURES_DIR = path.resolve(__dirname, "../eval/fixtures-wave1");
const CLAIMS_DIR = path.resolve(__dirname, "../eval/claims");
const DEFAULT_OUT = path.resolve(__dirname, "../eval/retrieval-labels");

const arg = (name: string): string | undefined => process.argv
  .find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

interface ClaimResolution {
  chunkId: string;
  filename: string;
  locator: string;
  quote: string;
}

interface ClaimsChunk {
  chunkId: string;
  locator: string;
  claims: Array<{ id: string; quote: string }>;
}

/** claim id -> where it lives in the corpus. Built once from every `eval/claims/*.json` file. */
const loadClaimIndex = (): Map<string, ClaimResolution> => {
  const index = new Map<string, ClaimResolution>();
  fs.readdirSync(CLAIMS_DIR).filter((f) => f.endsWith(".json")).forEach((file) => {
    const doc = JSON.parse(fs.readFileSync(path.join(CLAIMS_DIR, file), "utf8"));
    (doc.chunks ?? []).forEach((chunk: ClaimsChunk) => {
      chunk.claims.forEach((claim) => {
        index.set(claim.id, {
          chunkId: chunk.chunkId,
          filename: doc.filename,
          locator: chunk.locator,
          quote: claim.quote,
        });
      });
    });
  });
  return index;
};

/**
 * Claim ids are alnum, 3+ hyphen-separated segments, last segment exactly 2 digits — verified
 * against all 2,250 ids in `eval/claims/`. That final-segment check is what keeps this from
 * matching every other hyphenated phrase in the notes prose (document filenames, cross-fixture
 * mentions, "plus-or-minus", "out-of-scope"...); it still occasionally matches a real phrase
 * that happens to end in two digits (e.g. "in-situ-vs-25"), which the exact-match against
 * `loadClaimIndex()` below is what actually decides — this regex only picks the candidates the
 * coverage report calls "named".
 */
const CLAIM_ID_SHAPE = /\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+){2,}\b/g;

const namedClaimIds = (notes: string): string[] => [...new Set(
  (notes.match(CLAIM_ID_SHAPE) ?? []).filter((token) => /-\d{2}$/.test(token)),
)];

interface RelevantChunkDraft {
  chunkId: string;
  contentHash: string;
  filename: string;
  grade: number;
  evidence: string;
  /** Extra, additive field: the human locator, so a re-chunk can re-resolve rather than void. */
  locator: string;
  /** Extra, additive field: which named claim ids resolved to this chunk, for traceability. */
  claimIds: string[];
}

interface FixtureCoverage {
  fixtureId: string;
  fixtureClass: string;
  isRefusal: boolean;
  named: string[];
  resolved: string[];
  unresolved: string[];
  distinctChunks: string[];
  written: boolean;
}

const main = (): void => {
  const outDir = path.resolve(arg("out") ?? DEFAULT_OUT);
  fs.mkdirSync(outDir, { recursive: true });

  const claimIndex = loadClaimIndex();
  const corpus = readCorpus();
  const knownChunks = new Set<string>();
  corpus.documents.forEach((d) => d.chunks.forEach((c) => knownChunks.add(c.id)));

  const fixtureFiles = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json")).sort();
  const coverage: FixtureCoverage[] = [];

  fixtureFiles.forEach((file) => {
    const fixtureId = file.replace(/\.json$/, "");
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), "utf8"));
    const isRefusal = (fixture.answerable_from ?? []).length === 0;
    const named = namedClaimIds(fixture.notes ?? "");

    const resolved: string[] = [];
    const unresolved: string[] = [];
    const byChunk = new Map<string, { resolution: ClaimResolution; claimIds: string[] }>();

    named.forEach((id) => {
      const resolution = claimIndex.get(id);
      if (!resolution) {
        unresolved.push(id);
        return;
      }
      if (!knownChunks.has(resolution.chunkId)) {
        // Claims inventory and live corpus disagree — do not fabricate a label against a chunk
        // that no longer exists.
        unresolved.push(`${id} (chunk ${resolution.chunkId} not in corpus)`);
        return;
      }
      resolved.push(id);
      const entry = byChunk.get(resolution.chunkId);
      if (entry) {
        entry.claimIds.push(id);
      } else {
        byChunk.set(resolution.chunkId, { resolution, claimIds: [id] });
      }
    });

    // Refusal fixtures never get a chunk marked relevant, even if a stray claim id resolves —
    // notes name those as decoys/near-misses ("the sharpest named failure mode"), not sources.
    const relevant: RelevantChunkDraft[] = isRefusal ? [] : [...byChunk.entries()].map(
      ([chunkId, { resolution, claimIds }]) => ({
        chunkId,
        contentHash: chunkId.split("__").pop() as string,
        filename: resolution.filename,
        grade: 2,
        evidence: resolution.quote,
        locator: resolution.locator,
        claimIds,
      }),
    );

    // Nothing resolved and this isn't a refusal fixture: we have no basis for either a relevant
    // chunk or a noRelevantChunks claim. Skip the file rather than guess either way.
    if (!isRefusal && relevant.length === 0) {
      coverage.push({
        fixtureId,
        fixtureClass: fixture.class,
        isRefusal,
        named,
        resolved,
        unresolved,
        distinctChunks: [],
        written: false,
      });
      return;
    }

    const turns = (fixture.turns ?? []).map((turn: { content: string }, i: number) => ({
      turn: i + 1,
      query: turn.content,
      relevant,
      ...(isRefusal ? {
        noRelevantChunks: "refusal fixture (answerable_from empty) — no corpus chunk answers "
          + "this query. Mechanically labelled by scripts/resolveRetrievalLabels.ts; not "
          + "human-verified.",
      } : {}),
    }));

    const label = {
      fixtureId,
      // FixtureLabels.set only admits "committed" | "next"; wave1 replaced both the old
      // committed-30 and next-18 sets and there is no "next" batch right now, so "committed" is
      // the only defensible value here. Flagged in the report — this is a judgment call, not a
      // fact read off the data.
      set: "committed",
      fixtureClass: fixture.class,
      turns,
    };

    fs.writeFileSync(path.join(outDir, `${fixtureId}.json`), `${JSON.stringify(label, null, 2)}\n`, "utf8");

    coverage.push({
      fixtureId,
      fixtureClass: fixture.class,
      isRefusal,
      named,
      resolved,
      unresolved,
      distinctChunks: [...byChunk.keys()],
      written: true,
    });
  });

  // ---- coverage report ----

  log.info(`${coverage.length} fixtures processed, ${coverage.filter((c) => c.written).length} label files written to ${path.relative(process.cwd(), outDir)}\n`);

  log.info("Per fixture: named / resolved / unresolved claim ids, distinct chunks:");
  coverage.forEach((c) => {
    let tag = "";
    if (c.isRefusal) tag = " [refusal]";
    else if (!c.written) tag = "  <-- NOT WRITTEN, needs manual labelling";
    log.info(`  ${c.fixtureId.padEnd(48)} named=${c.named.length} resolved=${c.resolved.length} unresolved=${c.unresolved.length} chunks=${c.distinctChunks.length}${tag}`);
    if (c.unresolved.length > 0) {
      log.info(`      unresolved: ${c.unresolved.join(", ")}`);
    }
  });

  const noneNamed = coverage.filter((c) => c.named.length === 0);
  log.info(`\nFixtures naming zero claim ids (${noneNamed.length}):`);
  noneNamed.forEach((c) => log.info(`  ${c.fixtureId}${c.isRefusal ? " [refusal — expected]" : "  <-- NOT a refusal fixture, needs manual labelling"}`));

  const notWritten = coverage.filter((c) => !c.written);
  log.info(`\nFixtures with no label file written (${notWritten.length}):`);
  notWritten.forEach((c) => log.info(`  ${c.fixtureId}`));

  const dist = { 1: 0, 2: 0, "3+": 0 };
  coverage.filter((c) => c.written && !c.isRefusal).forEach((c) => {
    const n = c.distinctChunks.length;
    if (n <= 1) dist[1] += 1;
    else if (n === 2) dist[2] += 1;
    else dist["3+"] += 1;
  });
  log.info("\nDistinct-chunk distribution (non-refusal, written fixtures):");
  log.info(`  1 chunk: ${dist[1]}   2 chunks: ${dist[2]}   3+ chunks: ${dist["3+"]}`);

  const refusalCount = coverage.filter((c) => c.isRefusal).length;
  log.info(`\nRefusal-class fixtures (answerable_from empty): ${refusalCount} — all written with relevant=[] + noRelevantChunks on every turn.`);

  const totalUnresolved = coverage.reduce((sum, c) => sum + c.unresolved.length, 0);
  const totalResolved = coverage.reduce((sum, c) => sum + c.resolved.length, 0);
  log.info(`\nTotals: ${totalResolved} claim ids resolved, ${totalUnresolved} unresolved, across ${coverage.reduce((sum, c) => sum + c.named.length, 0)} named.`);
};

main();
