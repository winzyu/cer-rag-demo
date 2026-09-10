import fs from "fs";
import os from "os";
import path from "path";
import {
  AVAILABLE_CAPABILITIES,
  availableCapabilities,
  countTurns,
  loadFixtures,
  runnableFixtures,
} from "../../src/eval/fixtures";
import { EVAL_CLASSES } from "../../src/eval/types";
import { DIRECT_FEED_SLICE, DOC_META } from "../../src/ingestion/corpus";

/**
 * The fixtures are committed before any arm runs, so this suite is the only thing standing
 * between a typo and a wasted sweep. It validates the real committed set, then proves the
 * loader actually rejects the malformed cases it claims to.
 */

const writeFixtureDir = (files: Record<string, unknown>): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-fixtures-"));
  Object.entries(files).forEach(([name, body]) => {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(body), "utf8");
  });
  return dir;
};

const validFixture = {
  id: "sample",
  class: "definitional",
  expected_to_favor: "tie",
  answerable_from: ["water-quality-metrics-source-of-truth.pdf"],
  requires: [],
  notes: "A minimal valid fixture used to isolate one validation rule at a time.",
  turns: [
    {
      role: "user",
      content: "What is ORP?",
      rubric: { must_contain: ["expands the acronym"], must_not: ["invents a unit"] },
    },
    {
      role: "user",
      content: "Why does it matter?",
      rubric: { must_contain: ["resolves the pronoun"], must_not: [] },
    },
  ],
};

const withFixture = (patch: Record<string, unknown>, name = "sample.json"): string => writeFixtureDir(
  { [name]: { ...validFixture, id: name.replace(/\.json$/, ""), ...patch } },
);

/** The seven classes `EVAL_REBUILD.md` §2 allocates wave 1 across. */
const WAVE1_CLASSES = [
  "cross-document", "deep-in-manual", "definitional", "follow-up",
  "precedence", "probe-calibration", "refusal",
] as const;

describe("committed eval fixtures", () => {
  const fixtures = loadFixtures();

  it("loads the whole set without validation errors", () => {
    // A floor, not a range. `EVAL_REBUILD.md` §2 sizes wave 1 at 40-45 fixtures (46 landed) and
    // wave 2 tops the same directory up to ~60, so an upper bound would have to move twice. The
    // floor is what catches a truncated or half-written directory, which is the real failure.
    expect(fixtures.length).toBeGreaterThanOrEqual(40);
  });

  it("gives every fixture a unique id", () => {
    const ids = fixtures.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers the seven classes wave 1 populates", () => {
    // `EVAL_CLASSES` still declares twelve. §2 populates seven and records the other five as
    // deliberately unpopulated — `acronym-exact-token` because it is slice-answerable and cannot
    // discriminate, `event-signature`/`sensor-combined` because extraction damaged the signature
    // matrix, `fouling-drift` on thin support, `threshold-lookup` folded into `deep-in-manual`.
    // So this asserts the wave-1 seven are present, not that all twelve are.
    const covered = new Set(fixtures.map((fixture) => fixture.class));
    expect([...WAVE1_CLASSES].filter((cls) => !covered.has(cls))).toEqual([]);
    // Every class still has to be a declared one; the loader rejects anything else.
    covered.forEach((cls) => expect(EVAL_CLASSES).toContain(cls));
  });

  it("makes every conversation multi-turn", () => {
    // Single-turn fixtures cannot measure follow-up or pronoun behaviour, which is the
    // stated reason the eval set is conversations rather than questions (§5).
    fixtures.forEach((fixture) => {
      expect(fixture.turns.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("only cites documents that are in the corpus", () => {
    fixtures.forEach((fixture) => {
      fixture.turns.forEach((turn) => {
        (turn.rubric.cite ?? []).forEach((filename) => {
          expect(Object.keys(DOC_META)).toContain(filename);
        });
      });
    });
  });

  it("meets exit criterion 3 — a quarter of the set is answerable only outside the slice", () => {
    // `EVAL_REBUILD.md` §2, wave-1 exit criterion 3: **at least 25%** of turns must be
    // answerable ONLY outside the ◆G9 direct-feed slice. A question the slice can answer cannot
    // discriminate between retrieval strategies, and the archived set failed exactly here — 27
    // of its 30 fixtures were answerable from 4.4% of the corpus.
    //
    // This replaced an assertion that merely *some* fixture was not fully slice-answerable.
    // With 0 fixtures at `full` that read `46 > 0` and could never fail; the real criterion
    // both passes today (measured 89%) and would bite if generation drifted toward easy
    // questions, which is the failure mode §2 says to watch for.
    const outsideOnly = fixtures.filter((fixture) => fixture.sliceCoverage === "none");

    expect(outsideOnly.length / fixtures.length).toBeGreaterThanOrEqual(0.25);
  });

  it("derives slice coverage from the ◆G9 slice, checked against a hand-worked case", () => {
    // Checked against fixtures built here rather than by re-running `sliceCoverageOf`'s own
    // logic over its own output, which is what this used to do — a tautology that held for any
    // data. `DIRECT_FEED_SLICE` is read live so adding a document to the slice moves the test.
    const inSlice = DIRECT_FEED_SLICE[0];
    const outside = Object.keys(DOC_META).find((doc) => !DIRECT_FEED_SLICE.includes(doc))!;

    const coverageOf = (answerableFrom: string[]): string => loadFixtures(
      withFixture({ answerable_from: answerableFrom, expected_to_favor: "tie" }),
    )[0].sliceCoverage;

    expect(coverageOf([inSlice])).toBe("full");
    expect(coverageOf([outside])).toBe("none");
    expect(coverageOf([inSlice, outside])).toBe("partial");
  });

  it("marks fixtures that depend on capabilities the service lacks", () => {
    // Stated as an equivalence rather than a hard-coded list, so landing a capability
    // (turbidity in N4, the sensor tool in N3) flips the fixtures without editing this test.
    //
    // Wave 1 declares no `requires`, so over the live set this only ever confirms that all 46
    // are runnable. The equivalence is exercised properly against a gated fixture in "the
    // sensor-tool gate" below; the tautological `runnableFixtures(...).every(f => f.runnable)`
    // that used to sit here — filter-then-test-the-filter-predicate — was dropped.
    fixtures.forEach((fixture) => {
      const satisfied = fixture.requires.every((req) => AVAILABLE_CAPABILITIES.includes(req));
      expect(fixture.runnable).toBe(satisfied);
    });
    expect(runnableFixtures(fixtures)).toHaveLength(fixtures.length);
  });

  describe("the sensor-tool gate", () => {
    it("gates nothing in wave 1, which declares no requires at all", () => {
      // The archived set had two `sensor-combined` fixtures and so its runnable count moved with
      // the flag. Wave 1 drops that class (§2: the source-of-truth signature matrix is damaged),
      // so every fixture is runnable either way and the whole set replays under both flags.
      const off = loadFixtures(undefined, availableCapabilities(false));
      const on = loadFixtures(undefined, availableCapabilities(true));

      expect(fixtures.every((fixture) => fixture.requires.length === 0)).toBe(true);
      expect(off.filter((fixture) => fixture.runnable)).toHaveLength(fixtures.length);
      expect(on.filter((fixture) => fixture.runnable)).toHaveLength(fixtures.length);
    });

    it("still holds back a fixture that requires the tool", () => {
      // Kept on a synthetic fixture rather than dropped: wave 1 exercises none of this, and a
      // gate with no live case is a gate nobody notices breaking before wave 2 needs it.
      const dir = withFixture({ id: "gated", requires: ["sensor-tool"] }, "gated.json");

      expect(loadFixtures(dir, availableCapabilities(false))[0].runnable).toBe(false);
      expect(loadFixtures(dir, availableCapabilities(true))[0].runnable).toBe(true);
    });

    it("reports the capability set from the flag, not from a hard-coded list", () => {
      expect(availableCapabilities(false)).not.toContain("sensor-tool");
      expect(availableCapabilities(true)).toContain("sensor-tool");
      // turbidity-in-scope landed for real in N4 and is not conditional.
      expect(availableCapabilities(false)).toContain("turbidity-in-scope");
    });
  });

  it("counts turns for sweep costing", () => {
    expect(countTurns(fixtures)).toBe(
      fixtures.reduce((total, fixture) => total + fixture.turns.length, 0),
    );
  });
});

describe("fixture validation", () => {
  it("rejects an id that does not match the filename", () => {
    expect(() => loadFixtures(withFixture({ id: "mismatched" }))).toThrow(/must match the filename/);
  });

  it("rejects an unknown question class", () => {
    expect(() => loadFixtures(withFixture({ class: "vibes" }))).toThrow(/not a known eval class/);
  });

  it("rejects a source document that is not in the corpus", () => {
    expect(() => loadFixtures(withFixture({ answerable_from: ["nope.pdf"] })))
      .toThrow(/not a corpus document/);
  });

  it("rejects a citation missing from answerable_from", () => {
    const turns = [
      {
        ...validFixture.turns[0],
        rubric: { must_contain: ["something"], must_not: [], cite: ["usgs-nfm-a6.2-dissolved-oxygen.pdf"] },
      },
      validFixture.turns[1],
    ];
    expect(() => loadFixtures(withFixture({ turns })))
      .toThrow(/missing from answerable_from/);
  });

  it("rejects an empty must_contain", () => {
    const turns = [
      { ...validFixture.turns[0], rubric: { must_contain: [], must_not: [] } },
      validFixture.turns[1],
    ];
    // An empty rubric grades every answer, including an empty one, as a pass.
    expect(() => loadFixtures(withFixture({ turns }))).toThrow(/must_contain/);
  });

  it("rejects a single-turn conversation", () => {
    expect(() => loadFixtures(withFixture({ turns: [validFixture.turns[0]] })))
      .toThrow(/at least 2 user turns/);
  });

  it("rejects a non-boolean requires_refusal", () => {
    const turns = [
      { ...validFixture.turns[0], requires_refusal: "yes" },
      validFixture.turns[1],
    ];
    expect(() => loadFixtures(withFixture({ turns })))
      .toThrow(/requires_refusal must be a boolean/);
  });

  it("accepts a turn with requires_refusal set or omitted", () => {
    const turns = [
      { ...validFixture.turns[0], requires_refusal: true },
      validFixture.turns[1],
    ];
    expect(() => loadFixtures(withFixture({ turns }))).not.toThrow();
  });

  it("rejects an assistant turn", () => {
    const turns = [{ ...validFixture.turns[0], role: "assistant" }, validFixture.turns[1]];
    expect(() => loadFixtures(withFixture({ turns }))).toThrow(/role must be "user"/);
  });

  it("rejects a rag prediction that the slice fully answers", () => {
    expect(() => loadFixtures(withFixture({ expected_to_favor: "rag" })))
      .toThrow(/every source is inside/);
  });

  it("rejects a direct-feed prediction with no in-slice source", () => {
    expect(() => loadFixtures(withFixture({
      expected_to_favor: "direct-feed",
      answerable_from: ["usgs-nfm-a6.2-dissolved-oxygen.pdf"],
      turns: validFixture.turns.map((turn) => ({ ...turn, rubric: { ...turn.rubric } })),
    }))).toThrow(/no source is inside/);
  });

  it("reports every problem at once rather than the first", () => {
    let message = "";
    try {
      loadFixtures(withFixture({ id: "mismatched", class: "vibes" }));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/must match the filename/);
    expect(message).toMatch(/not a known eval class/);
  });

  it("throws when the directory holds no fixtures", () => {
    expect(() => loadFixtures(writeFixtureDir({}))).toThrow(/No eval fixtures found/);
  });
});
