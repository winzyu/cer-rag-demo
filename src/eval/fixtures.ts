import fs from "fs";
import path from "path";
import { config } from "../config";
import { DIRECT_FEED_SLICE, DOC_META } from "../ingestion/corpus";
import {
  EVAL_CLASSES,
  EVAL_FAVORS,
  EVAL_REQUIREMENTS,
} from "./types";
import type {
  EvalFixture,
  EvalRequirement,
  EvalTurn,
  LoadedFixture,
  SliceCoverage,
} from "./types";

/**
 * Loads and validates the committed eval fixtures (`RETRIEVAL_BAKEOFF.md` §5).
 *
 * Validation is strict and collects every problem before throwing, matching the config
 * loader's approach (conventions §8, no schema library). The point is that a typo in a
 * filename or a class name fails at load — not after three arms have been replayed and
 * paid for.
 */

/**
 * `src/eval` and `dist/eval` are both one directory below the repo root.
 *
 * **Points at the wave 1 rebuild, not at `eval/fixtures/`** (`EVAL_REBUILD.md` §2). The old
 * 30-fixture set was archived under `eval-archive-2026-09-01`; the name is deliberately left
 * free, because the last step of the migration is renaming `eval/fixtures-wave1` back to
 * `eval/fixtures` and reverting this constant to the plain name.
 */
export const FIXTURE_DIR = path.resolve(__dirname, "../../eval/fixtures-wave1");

/**
 * Capabilities the service has today. Fixtures requiring anything absent from this list are
 * committed but not runnable — see `EVAL_REQUIREMENTS`.
 *
 * `turbidity-in-scope` landed 2026-07-29: the system prompt now lists turbidity as measured and
 * carries an operator range for it (`src/prompt/systemPrompt.ts`).
 *
 * **`sensor-tool` is conditional, not permanent.** `query_sensor_data` and the tool loop are
 * built (Phase N3) but gated on `SENSOR_TOOL`, which defaults off. Deriving the capability from
 * that same flag keeps the eval honest in both directions: a fixture needing the tool is
 * unrunnable while the flag is off, and runnable when it is on. Hard-coding `sensor-tool` here
 * would let a default-configured sweep "run" a fixture against a tool the model was never
 * offered, and grade the refusal as an answer.
 *
 * **Wave 1 exercises none of this.** It declares no `requires` at all (§2 drops the
 * `sensor-combined` class), so all 46 fixtures are runnable under either setting and the flag
 * changes nothing. The archived 30-fixture set is where the 28-of-30 split came from.
 */
export const availableCapabilities = (
  sensorTool: boolean = config.tools.sensorTool,
): readonly EvalRequirement[] => (
  sensorTool ? ["turbidity-in-scope", "sensor-tool"] : ["turbidity-in-scope"]
);

/** What this deployment can do right now. */
export const AVAILABLE_CAPABILITIES: readonly EvalRequirement[] = availableCapabilities();

const isStringArray = (value: unknown): value is string[] => Array.isArray(value)
  && value.every((entry) => typeof entry === "string" && entry.trim() !== "");

const validateTurn = (
  turn: unknown,
  where: string,
  answerableFrom: string[],
  errors: string[],
): void => {
  if (typeof turn !== "object" || turn === null) {
    errors.push(`${where}: must be an object.`);
    return;
  }
  const { role, content, rubric } = turn as Record<string, unknown>;

  if (role !== "user") {
    errors.push(`${where}.role must be "user" — fixtures drive the conversation.`);
  }
  if (typeof content !== "string" || content.trim() === "") {
    errors.push(`${where}.content must be a non-empty string.`);
  }
  if (typeof rubric !== "object" || rubric === null) {
    errors.push(`${where}.rubric must be an object.`);
    return;
  }

  const {
    must_contain, must_not, cite, notes,
  } = rubric as Record<string, unknown>;
  const { requires_refusal: requiresRefusal } = turn as Record<string, unknown>;

  if (requiresRefusal !== undefined && typeof requiresRefusal !== "boolean") {
    errors.push(`${where}.requires_refusal must be a boolean when present.`);
  }

  // An empty must_contain would grade to "pass" for any answer at all, including silence.
  if (!isStringArray(must_contain) || must_contain.length === 0) {
    errors.push(`${where}.rubric.must_contain must be a non-empty array of strings.`);
  }
  if (!isStringArray(must_not)) {
    errors.push(`${where}.rubric.must_not must be an array of strings.`);
  }
  if (cite !== undefined) {
    if (!isStringArray(cite) || cite.length === 0) {
      errors.push(`${where}.rubric.cite must be a non-empty array of strings when present.`);
    } else {
      cite.forEach((filename) => {
        if (!(filename in DOC_META)) {
          errors.push(`${where}.rubric.cite: "${filename}" is not a corpus document.`);
        }
        // The citation target has to be material the fixture already claims answers it,
        // or the two fields disagree about what the conversation needs.
        if (!answerableFrom.includes(filename)) {
          errors.push(`${where}.rubric.cite: "${filename}" is missing from answerable_from.`);
        }
      });
    }
  }
  if (notes !== undefined && (typeof notes !== "string" || notes.trim() === "")) {
    errors.push(`${where}.rubric.notes must be a non-empty string when present.`);
  }
};

const sliceCoverageOf = (answerableFrom: string[]): SliceCoverage => {
  if (answerableFrom.length === 0) return "none";
  const inSlice = answerableFrom.filter((filename) => DIRECT_FEED_SLICE.includes(filename));
  if (inSlice.length === answerableFrom.length) return "full";
  return inSlice.length === 0 ? "none" : "partial";
};

const validateFixture = (
  raw: unknown,
  filename: string,
  dir: string,
  errors: string[],
): void => {
  const where = `${path.relative(process.cwd(), dir)}/${filename}`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push(`${where}: must be a JSON object.`);
    return;
  }
  const fixture = raw as Record<string, unknown>;
  const expectedId = filename.replace(/\.json$/, "");

  if (fixture.id !== expectedId) {
    errors.push(`${where}: id "${String(fixture.id)}" must match the filename stem.`);
  }
  if (!EVAL_CLASSES.includes(fixture.class as never)) {
    errors.push(`${where}: class "${String(fixture.class)}" is not a known eval class.`);
  }
  if (!EVAL_FAVORS.includes(fixture.expected_to_favor as never)) {
    errors.push(`${where}: expected_to_favor "${String(fixture.expected_to_favor)}" is invalid.`);
  }
  if (typeof fixture.notes !== "string" || fixture.notes.trim() === "") {
    errors.push(`${where}: notes must explain why the fixture is in the set.`);
  }

  if (!isStringArray(fixture.answerable_from) && !(Array.isArray(fixture.answerable_from)
    && fixture.answerable_from.length === 0)) {
    errors.push(`${where}: answerable_from must be an array of corpus filenames.`);
    return;
  }
  const answerableFrom = fixture.answerable_from as string[];
  answerableFrom.forEach((doc) => {
    if (!(doc in DOC_META)) {
      errors.push(`${where}: answerable_from "${doc}" is not a corpus document.`);
    }
  });

  if (!Array.isArray(fixture.requires)
    || fixture.requires.some((req) => !EVAL_REQUIREMENTS.includes(req as never))) {
    errors.push(`${where}: requires must contain only ${EVAL_REQUIREMENTS.join(", ")}.`);
  }

  if (!Array.isArray(fixture.turns) || fixture.turns.length < 2) {
    // Single-turn fixtures defeat the purpose: follow-up and pronoun behaviour is what
    // multi-turn replay exists to measure (RETRIEVAL_BAKEOFF.md §5).
    errors.push(`${where}: turns must be an array of at least 2 user turns.`);
    return;
  }
  (fixture.turns as unknown[]).forEach((turn, index) => {
    validateTurn(turn, `${where}.turns[${index}]`, answerableFrom, errors);
  });

  // A fixture predicted to favour RAG must not be fully answerable from the direct-feed
  // slice — otherwise the prediction contradicts ◆G9 and the result is uninterpretable.
  if (fixture.expected_to_favor === "rag" && sliceCoverageOf(answerableFrom) === "full") {
    errors.push(`${where}: expected_to_favor "rag" but every source is inside the ◆G9 slice.`);
  }
  if (fixture.expected_to_favor === "direct-feed" && answerableFrom.length > 0
    && sliceCoverageOf(answerableFrom) === "none") {
    errors.push(`${where}: expected_to_favor "direct-feed" but no source is inside the ◆G9 slice.`);
  }
};

/**
 * Reads every fixture, validates the whole set, and throws once with all problems listed.
 * Derived fields (`sliceCoverage`, `runnable`) are computed here rather than stored, so they
 * cannot drift from `DIRECT_FEED_SLICE` or from what the service can actually do.
 */
export const loadFixtures = (
  dir: string = FIXTURE_DIR,
  capabilities: readonly EvalRequirement[] = AVAILABLE_CAPABILITIES,
): LoadedFixture[] => {
  const filenames = fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  const errors: string[] = [];

  if (filenames.length === 0) {
    throw new Error(`No eval fixtures found in ${dir}.`);
  }

  const fixtures = filenames.map((filename) => {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, filename), "utf8")) as unknown;
    validateFixture(parsed, filename, dir, errors);
    return parsed as EvalFixture;
  });

  if (errors.length > 0) {
    throw new Error(`Invalid eval fixtures:\n- ${errors.join("\n- ")}`);
  }

  return fixtures.map((fixture) => ({
    ...fixture,
    sliceCoverage: sliceCoverageOf(fixture.answerable_from),
    runnable: fixture.requires.every((req) => capabilities.includes(req)),
  }));
};

/** The subset a sweep can replay today. The rest are committed and wait on N3/N4. */
export const runnableFixtures = (fixtures: LoadedFixture[]): LoadedFixture[] => fixtures
  .filter((fixture) => fixture.runnable);

/** Total user turns — one LLM call each, per arm, per pass. The sweep's cost driver. */
export const countTurns = (fixtures: LoadedFixture[]): number => fixtures
  .reduce((total, fixture) => total + fixture.turns.length, 0);

export type { EvalFixture, EvalTurn, LoadedFixture };
