/**
 * The eval-fixture contract for the Phase N2 bake-off (`RETRIEVAL_BAKEOFF.md` §5).
 *
 * Fixtures are **data, not code**: one JSON file per conversation, committed before any arm
 * runs. The loader's `FIXTURE_DIR` decides where — `eval/fixtures-wave1/` during the rebuild,
 * `eval/fixtures/` before it and again after. The types here exist so the capture runner and the
 * offline grader read the same shape, and so a malformed rubric fails at load rather than halfway
 * through a paid sweep.
 */

/**
 * Question classes from `RETRIEVAL_BAKEOFF.md` §5, extended for the rescoped corpus.
 *
 * **Twelve are declared; wave 1 populates seven** — `deep-in-manual`, `cross-document`,
 * `probe-calibration`, `precedence`, `definitional`, `follow-up`, `refusal`. The other five are
 * deliberately unpopulated rather than removed (`EVAL_REBUILD.md` §2): `acronym-exact-token` is
 * slice-answerable and so cannot discriminate between retrieval strategies; `event-signature` and
 * `sensor-combined` depend on a source-of-truth signature matrix that extraction damaged;
 * `fouling-drift` has one operator-document claim behind it; `threshold-lookup` was folded into
 * `deep-in-manual`, which is the same question shape. They stay in the type so a wave 2 or a
 * repaired document can populate them without a schema change.
 */
export const EVAL_CLASSES = [
  "definitional",
  "acronym-exact-token",
  "threshold-lookup",
  "cross-document",
  "deep-in-manual",
  "follow-up",
  "precedence",
  "refusal",
  "probe-calibration",
  "fouling-drift",
  "event-signature",
  "sensor-combined",
] as const;

export type EvalClass = (typeof EVAL_CLASSES)[number];

/**
 * Which arm the fixture is *predicted* to favour, recorded before the run so the prediction
 * can be scored against the result rather than reconstructed afterwards.
 */
export const EVAL_FAVORS = ["direct-feed", "rag", "tie"] as const;

export type EvalFavors = (typeof EVAL_FAVORS)[number];

/**
 * Capabilities a fixture needs that do not exist yet. A fixture naming one of these is
 * committed but **not runnable**, and the runner filters on it rather than silently
 * producing a transcript that grades a missing feature.
 *
 * - `sensor-tool` — `query_sensor_data` and the tool-round loop (Phase N3).
 * - `turbidity-in-scope` — the system prompt currently declares turbidity *not* measured,
 *   so a turbidity question is refused before retrieval is ever consulted (Phase N4).
 */
export const EVAL_REQUIREMENTS = ["sensor-tool", "turbidity-in-scope"] as const;

export type EvalRequirement = (typeof EVAL_REQUIREMENTS)[number];

export interface EvalRubric {
  /** Claims the answer must make. Each entry is graded independently, so keep them atomic. */
  must_contain: string[];
  /** Failure modes. A `must_not` hit is a groundedness/correctness failure, not a style note. */
  must_not: string[];
  /** Corpus filenames that actually support the answer — the citation-validity target. */
  cite?: string[];
  notes?: string;
}

export interface EvalTurn {
  /** Fixtures drive the conversation, so every turn is a user turn. */
  role: "user";
  content: string;
  /** Every turn produces a gradeable answer, so every turn carries its own rubric. */
  rubric: EvalRubric;
  /** This turn's rubric admits no substantive answer, so the pinned refusal sentence is
   * required. */
  requires_refusal?: boolean;
}

export interface EvalFixture {
  /** Kebab-case, unique, and equal to the filename stem. */
  id: string;
  class: EvalClass;
  expected_to_favor: EvalFavors;
  /** Corpus filenames containing the material the conversation needs. May be empty for refusals. */
  answerable_from: string[];
  requires: EvalRequirement[];
  notes: string;
  turns: EvalTurn[];
}

/** Derived at load time from `answerable_from` — never stored, so it cannot drift from ◆G9. */
export type SliceCoverage = "full" | "partial" | "none";

export interface LoadedFixture extends EvalFixture {
  /** How much of the needed material sits inside the ◆G9 direct-feed slice. */
  sliceCoverage: SliceCoverage;
  /** False when `requires` names a capability the service does not have yet. */
  runnable: boolean;
}
