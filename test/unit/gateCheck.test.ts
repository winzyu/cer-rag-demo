/**
 * Guards the §8a hard-gate checker.
 *
 * The first test is the reason this file exists. A naive `answer.includes(REFUSAL_SENTENCE)` scores
 * **zero** on a perfect refusal, because the model emits U+2011 NON-BREAKING HYPHEN in
 * `water‑quality` where the pinned constant has U+002D — and NFKC folds U+2011 to U+2010, not to
 * U+002D, so normalising without an explicit dash class does not save it either. That would have
 * reported a passing arm as failing an absolute pre-registered gate.
 */
import {
  checkCitations,
  checkFigures,
  checkQuotes,
  checkRefusal,
  MIN_QUOTE_CHARS,
} from "../../src/eval/gates/checks";
import {
  closestWindow,
  editDistance,
  normalizeForMatch,
} from "../../src/eval/gates/normalize";
import { REFUSAL_SENTENCE } from "../../src/prompt/systemPrompt";
import { refusalMap } from "../../src/eval/gates/runner";
import { loadFixtures } from "../../src/eval/fixtures";
import type { LoadedFixture } from "../../src/eval/fixtures";

jest.mock("../../src/eval/fixtures");
const mockLoadFixtures = loadFixtures as jest.MockedFunction<typeof loadFixtures>;

/** Enough of `LoadedFixture` for `refusalMap`, which only reads `id`, `class` and `turns`. */
const fixture = (
  id: string,
  fixtureClass: string,
  turns: { requires_refusal?: boolean }[],
): LoadedFixture => ({
  id,
  class: fixtureClass as LoadedFixture["class"],
  expected_to_favor: "tie",
  answerable_from: [],
  requires: [],
  notes: "test fixture",
  sliceCoverage: "none",
  runnable: true,
  turns: turns.map((turn) => ({
    role: "user",
    content: "question",
    rubric: { must_contain: ["something"], must_not: [] },
    ...turn,
  })),
});

/**
 * Exactly what `eval/transcripts/warm/firestore-direct/refusal-pathogens.json` turn 2 contained.
 * That capture was archived on 2026-09-01; it is still readable at
 * `git show eval-archive-2026-09-01:eval/transcripts/warm/firestore-direct/refusal-pathogens.json`.
 */
const NBSP_HYPHEN_REFUSAL = REFUSAL_SENTENCE.replace("water-quality", "water‑quality");

const context = (text: string, id = "doc.pdf"): { id: string; text: string }[] => [{ id, text }];

describe("normalizeForMatch", () => {
  it("folds the non-breaking hyphen NFKC leaves alone", () => {
    expect("water‑quality".normalize("NFKC")).not.toBe("water-quality");
    expect(normalizeForMatch("water‑quality")).toBe("water-quality");
  });

  it("folds micro sign onto greek mu, matching the BM25 tokenizer", () => {
    expect(normalizeForMatch("µS/cm")).toBe(normalizeForMatch("μS/cm"));
  });

  it("folds typographic apostrophes and collapses exotic whitespace", () => {
    expect(normalizeForMatch("don’t")).toBe("don't");
    expect(normalizeForMatch("a  b")).toBe("a b");
  });

  it("drops zero-width characters rather than treating them as a difference", () => {
    expect(normalizeForMatch("pH​ 6.5")).toBe("ph 6.5");
  });
});

describe("editDistance", () => {
  it("counts single-character edits", () => {
    expect(editDistance("abc", "abc")).toBe(0);
    expect(editDistance("abc", "abd")).toBe(1);
    expect(editDistance("abc", "ab")).toBe(1);
  });

  it("abandons early once the cutoff is provably exceeded", () => {
    expect(editDistance("abcdef", "zzzzzz", 2)).toBeGreaterThan(2);
  });
});

describe("closestWindow", () => {
  it("finds the sentence inside a longer answer", () => {
    const { distance } = closestWindow("padding here. needle. trailing", "needle.", 2);
    expect(distance).toBe(0);
  });

  it("tolerates a one-character difference", () => {
    const { distance } = closestWindow("padding needlz. trailing", "needle.", 2);
    expect(distance).toBe(1);
  });
});

describe("checkRefusal", () => {
  it("reports an untouched refusal as an exact match", () => {
    const result = checkRefusal(`${REFUSAL_SENTENCE} The threshold is not in the documents.`);
    expect(result.match).toBe("exact");
    expect(result.distance).toBe(0);
  });

  it("passes the real transcript's non-breaking hyphen, and says why", () => {
    // The whole point: a naive comparison fails here, on an answer that is a perfect refusal.
    expect(NBSP_HYPHEN_REFUSAL.includes(REFUSAL_SENTENCE)).toBe(false);

    const result = checkRefusal(NBSP_HYPHEN_REFUSAL);
    expect(result.match).toBe("normalized");
    expect(result.note).toContain("U+2011");
  });

  it("separates a tolerance match from an exact one so 100% never quietly means close enough", () => {
    const typo = REFUSAL_SENTENCE.replace("grounded", "groundedd");
    const result = checkRefusal(typo, 2);
    expect(result.match).toBe("tolerance");
    expect(result.distance).toBe(1);
    expect(result.note).toContain("NOT an exact pass");
  });

  it("grants no edit slack at tolerance 0", () => {
    const typo = REFUSAL_SENTENCE.replace("grounded", "groundedd");
    // Not counted as a tolerance pass — but it still refused and named no figure, so it does not
    // veto either. The knob controls wording credit, never whether the arm survives.
    const result = checkRefusal(typo, 0);
    expect(result.match).toBe("off-contract");
    expect(result.vetoes).toBe(false);

    // Folding is not tolerance, so it still passes with the knob at zero.
    expect(checkRefusal(NBSP_HYPHEN_REFUSAL, 0).match).toBe("normalized");
  });

  it("vetoes an answer that states a figure on a turn that had to refuse", () => {
    const result = checkRefusal("The E. coli threshold is 126 CFU/100 mL.");
    expect(result.match).toBe("answered");
    expect(result.vetoes).toBe(true);
    expect(result.note).toContain("126");
    expect(result.similarity).toBeLessThan(0.5);
  });

  it("passes a differently-worded refusal that supplies no figure", () => {
    // Measured: hybrid-slice-lexvec answered the E. coli turn exactly this way. It refused and
    // gave no number, so §8a's "must refuse" is met; the wording is the judge's problem.
    const result = checkRefusal("I'm sorry, but I can't help with that.");
    expect(result.match).toBe("off-contract");
    expect(result.vetoes).toBe(false);
    expect(result.note).toContain("judge");
  });

  it("keeps every non-exact outcome non-vetoing except an actual answer", () => {
    expect(checkRefusal(REFUSAL_SENTENCE).vetoes).toBe(false);
    expect(checkRefusal(NBSP_HYPHEN_REFUSAL).vetoes).toBe(false);
  });
});

describe("refusalMap", () => {
  it("reads requires_refusal directly, not rubric prose", () => {
    mockLoadFixtures.mockReturnValue([
      fixture("probecal-example", "probe-calibration", [
        { requires_refusal: false },
        { requires_refusal: true },
      ]),
    ]);

    expect(refusalMap().get("probecal-example")).toEqual([false, true]);
  });

  it("treats a missing flag as false", () => {
    mockLoadFixtures.mockReturnValue([
      fixture("refusal-example", "refusal", [{}, { requires_refusal: true }]),
    ]);

    expect(refusalMap().get("refusal-example")).toEqual([false, true]);
  });

  it("throws when a refusal-class fixture has no flagged turn", () => {
    mockLoadFixtures.mockReturnValue([
      fixture("refusal-unflagged", "refusal", [{}, { requires_refusal: false }]),
    ]);

    expect(() => refusalMap()).toThrow(/no turn sets requires_refusal: true/);
  });

  it("does not throw when a non-refusal fixture has no flagged turn", () => {
    mockLoadFixtures.mockReturnValue([
      fixture("probecal-example", "probe-calibration", [{}, {}]),
    ]);

    expect(() => refusalMap()).not.toThrow();
  });
});

describe("checkCitations", () => {
  it("accepts a marker that resolves to supplied context", () => {
    const result = checkCitations({ answer: "Three weeks【1】.", context: context("line a\nline b") });
    expect(result).toMatchObject({ total: 1, valid: 1 });
  });

  it("flags a citation pointing past the end of the supplied context", () => {
    const result = checkCitations({ answer: "As noted【9】.", context: context("only one chunk") });
    expect(result.valid).toBe(0);
    expect(result.issues[0].reason).toContain("1 chunk(s) were supplied");
  });

  it("flags a line range the cited chunk does not have", () => {
    const result = checkCitations({ answer: "See【1†L1-L40】.", context: context("a\nb\nc") });
    expect(result.valid).toBe(0);
    expect(result.issues[0].reason).toContain("which has 3");
  });

  it("accepts a line range inside the chunk", () => {
    const result = checkCitations({ answer: "See【1†L1-L2】.", context: context("a\nb\nc") });
    expect(result.valid).toBe(1);
  });
});

describe("checkFigures", () => {
  it("passes a figure that appears in the supplied context", () => {
    const result = checkFigures({ answer: "pH ranges 6.5 to 8.5.", context: context("pH 6.5-8.5 normal") });
    expect(result.issues).toHaveLength(0);
  });

  it("flags a figure that appears nowhere in the context", () => {
    const result = checkFigures({ answer: "E. coli above 126 CFU is unsafe.", context: context("no numbers here") });
    expect(result.issues.map((i) => i.value)).toContain("126");
  });

  it("ignores document and section identifiers, which name rather than measure", () => {
    // Measured: this was hybrid-slice-lexvec's entire figures failure — three hits on "09" from
    // the model's rendering of the USGS chapter number, none of them a claim about the water.
    const result = checkFigures({
      answer: "Source: USGS Technical Memorandum TM 09 a6.2, Section 2.2, Table 6.8-5.",
      context: context("air-saturated water calibration"),
    });
    expect(result.issues).toHaveLength(0);
  });

  it("still catches a real figure sitting next to an identifier", () => {
    const result = checkFigures({
      answer: "Section 2.2 gives a threshold of 126 CFU.",
      context: context("no threshold here"),
    });
    expect(result.issues.map((i) => i.value)).toEqual(["126"]);
  });

  it("ignores markdown ordinals and citation markers", () => {
    const result = checkFigures({
      answer: "1. Rinse the probe【7†L2-L9】.\n2. Wait.",
      context: context("rinse then wait"),
    });
    expect(result.issues).toHaveLength(0);
  });

  it("matches across thousands separators, in both directions", () => {
    const separated = checkFigures({ answer: "Up to 200,000 uS/cm.", context: context("range 5 - 200000 uS/cm") });
    expect(separated.issues).toHaveLength(0);

    // The direction that actually bit: the system prompt writes `0 to 1,500`, answers write `1500`.
    const plain = checkFigures({
      answer: "Conductivity 0-1500 uS/cm.",
      context: [],
      grounding: ["Conductivity (this deployment is freshwater): 0 to 1,500 µS/cm"],
    });
    expect(plain.issues).toHaveLength(0);
  });

  it("counts the system prompt and the question as grounding, not invention", () => {
    const result = checkFigures({
      answer: "pH 8.4 sits inside the operator range of 6.5 to 8.5.",
      context: [],
      grounding: ["- pH: 6.5 to 8.5", "Is a pH of 8.4 normal?"],
    });
    expect(result.issues).toHaveLength(0);
  });

  it("explains a temperature the decoder converted rather than calling it fabricated", () => {
    // Context holds 25 °C; an answer quoting 77 °F is a conversion, not an invention. The label
    // names the direction that produced the answer's figure from the context's.
    const result = checkFigures({ answer: "It reads 77 degrees.", context: context("water temperature 25 C") });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].explained).toBe("°C→°F");
  });
});

describe("checkQuotes", () => {
  const QUOTED = "conductivity varies with temperature";

  it("supports a quote that appears verbatim in the chunk it cites", () => {
    const result = checkQuotes({
      answer: `Temperature matters 【1†"${QUOTED}"】.`,
      context: context(`Section 4. ${QUOTED}, so readings are compensated.`),
    });
    expect(result.total).toBe(1);
    expect(result.supported).toBe(1);
    expect(result.issues).toHaveLength(0);
  });

  it("flags a quote the cited chunk does not contain", () => {
    const result = checkQuotes({
      answer: "It says 【1†\"ORP responds faster than DO\"】.",
      context: context(`Section 4. ${QUOTED}.`),
    });
    expect(result.supported).toBe(0);
    expect(result.issues[0].reason).toContain("not found verbatim");
  });

  it("flags a quote pointing past the end of the supplied context", () => {
    const result = checkQuotes({
      answer: `See 【7†"${QUOTED}"】.`,
      context: context(QUOTED),
    });
    expect(result.supported).toBe(0);
    expect(result.issues[0].reason).toContain("1 chunk(s) were supplied");
  });

  /**
   * The check that stops this instrument reporting full support while measuring nothing: "pH"
   * occurs in nearly every chunk, so a two-character quote matches whatever it is pointed at.
   */
  it("counts a quote too short to be evidence separately from a missing one", () => {
    const short = "pH";
    expect(short.length).toBeLessThan(MIN_QUOTE_CHARS);

    const result = checkQuotes({
      answer: `The 【1†"${short}"】 reading.`,
      context: context(`${short} is the master variable here.`),
    });
    expect(result.supported).toBe(0);
    expect(result.short).toBe(1);
    expect(result.issues[0].reason).toContain("too short to be evidence");
  });

  /**
   * Same defect family as the U+2011 refusal hyphen: the corpus comes from PDFs and the answer
   * comes from a model, so they disagree on hyphens, typographic quotes and µ vs μ without
   * disagreeing on a word. A bare `includes` scores this as fabrication.
   */
  it("matches through the typographic drift that breaks exact comparison", () => {
    const result = checkQuotes({
      answer: "It states 【1†“the water‑quality probe reads 5 μS/cm”】.",
      context: context("Note: the water-quality probe reads 5 µS/cm at rest."),
    });
    expect(result.supported).toBe(1);
    expect(result.issues).toHaveLength(0);
  });

  /**
   * The claim that lets the prompt change land without a flag day: `CITATION_PATTERN`'s line-span
   * group is optional and its trailing `[^】]*` swallows a quote, so a quote-style marker still
   * resolves as a plain `【n】` under the pre-registered citation gate. If this breaks, asking the
   * model for quotes silently moves published §8a citation numbers.
   */
  it("still resolves as a plain citation under the pre-registered gate", () => {
    const turn = {
      answer: `Temperature matters 【1†"${QUOTED}"】.`,
      context: context(QUOTED),
    };
    const citations = checkCitations(turn);
    expect(citations.total).toBe(1);
    expect(citations.issues).toHaveLength(0);
  });
});
