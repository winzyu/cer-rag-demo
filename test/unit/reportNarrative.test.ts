import { deterministicNarrative } from "../../src/report/narrative";
import type {
  ParameterBaseline, ParameterStats, ReportInput, SiteMetadata, WQEvent,
} from "../../src/report/types";

/**
 * narrative.ts is the rule-based (zero-AI-call) prose writer. Covers the two user-requested
 * fixes carried into this port -- summary as discrete bullets rather than one paragraph, and no
 * hardcoded section-number reference now that section numbering is dynamic (renderPdf.ts) -- plus
 * the N/A branch for a parameter with no baseline at all, and the provenance wording that
 * distinguishes a source-of-truth reference range from a device's operator-set threshold.
 */

const noAccuracy = (): number => 0;

const fixedBaseline = (
  key: string, label: string, unit: string, min: number, max: number,
): ParameterBaseline => ({
  key, label, unit, baselineMin: min, baselineMax: max, exceedanceMargin: 0.15, hasFixedBaseline: true,
});

const noFixedBaseline = (key: string, label: string, unit: string): ParameterBaseline => ({
  key, label, unit, baselineMin: 0, baselineMax: 0, exceedanceMargin: 0.15, hasFixedBaseline: false,
});

/** Turbidity as buildReportInput builds it -- no numeric baseline, uncalibrated relative scale. */
const relativeIndexBaseline = (): ParameterBaseline => ({
  key: "turbidity",
  label: "Turbidity (Relative)",
  unit: "",
  baselineMin: 0,
  baselineMax: 0,
  exceedanceMargin: 0.15,
  hasFixedBaseline: false,
  scale: "relative-index",
});

const HOUR = 3_600_000;
const BASE = Date.parse("2026-08-01T00:00:00.000Z");
/** A series whose values are given in order, one per hour. */
const hourly = (values: number[]): Array<[number, number]> => (
  values.map((v, i) => [BASE + i * HOUR, v])
);

const turbidityParam = (
  values: number[], overrides: Partial<ParameterStats> = {},
): ParameterStats => {
  const series = hourly(values);
  const sorted = [...values].sort((a, b) => a - b);
  return {
    baseline: relativeIndexBaseline(),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: values.reduce((sum, v) => sum + v, 0) / values.length,
    median: sorted[Math.floor(sorted.length / 2)],
    pattern: "unknown",
    series,
    ...overrides,
  };
};

const param = (baseline: ParameterBaseline, overrides: Partial<ParameterStats> = {}): ParameterStats => ({
  baseline,
  min: (baseline.baselineMin + baseline.baselineMax) / 2 - 0.1,
  max: (baseline.baselineMin + baseline.baselineMax) / 2 + 0.1,
  mean: (baseline.baselineMin + baseline.baselineMax) / 2,
  median: (baseline.baselineMin + baseline.baselineMax) / 2,
  pattern: "unknown",
  ...overrides,
});

const report = (parameters: ParameterStats[], events: WQEvent[] = []): ReportInput => ({
  site: {
    siteName: "Test Site", startDate: "2026-08-01", endDate: "2026-08-08", reportDate: "2026-08-09",
    waterBodyType: "Freshwater", clientName: "Not available",
  } as SiteMetadata,
  parameters,
  events,
});

describe("deterministicNarrative — summary is a bulleted list", () => {
  it("returns an array of discrete bullet strings, not one paragraph", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5));
    const { summaryBullets } = deterministicNarrative(report([ph]), noAccuracy, "Normal");

    expect(Array.isArray(summaryBullets)).toBe(true);
    expect(summaryBullets.length).toBeGreaterThan(1);
    summaryBullets.forEach((b) => expect(typeof b).toBe("string"));
  });

  it("states the all-clear plainly when status is Normal and no events fired", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5));
    const { summaryBullets } = deterministicNarrative(report([ph]), noAccuracy, "Normal");

    expect(summaryBullets[0]).toContain("Overall status: Normal");
    expect(summaryBullets.join(" ")).toContain("continue routine monitoring");
  });

  it("names the flagged parameters and event count when status is not Normal", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0 }); // clears the exceedance margin
    const events: WQEvent[] = [{
      type: "Inconclusive", windowStartMs: 0, windowEndMs: 1, severity: "Low",
      parameterMovements: "", interpretation: "", followUp: "", confidence: 0.2,
    }];
    const { summaryBullets } = deterministicNarrative(report([ph], events), noAccuracy, "Watch");

    expect(summaryBullets[0]).toContain("Overall status: Watch");
    // sentenceCase only touches the first character, so the label "pH" renders "PH" here --
    // that quirk is expected (see the ORP-acronym test below for why a full capitalize() isn't used).
    expect(summaryBullets[1]).toMatch(/^PH moved outside the site baseline/);
    expect(summaryBullets[2]).toContain("1 candidate event(s)");
  });

  it("never references a hardcoded section number, since numbering is dynamic in the PDF", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0 });
    const { summaryBullets } = deterministicNarrative(report([ph]), noAccuracy, "Watch");
    const joined = summaryBullets.join(" ");

    expect(joined).not.toMatch(/[Ss]ection\s+\d/);
    expect(joined).toContain("Recommendations below");
  });
});

describe("deterministicNarrative — parameter analysis", () => {
  it("omits a parameter from the analysis map when it held steady", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { pattern: "flat" }); // Normal + flat -> held steady
    const { parameterAnalysis } = deterministicNarrative(report([ph]), noAccuracy, "Normal");
    expect(parameterAnalysis.has("pH")).toBe(false);
  });

  it("includes a parameter that moved outside baseline, with the excursion described", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0, pattern: "flat" });
    const { parameterAnalysis } = deterministicNarrative(report([ph]), noAccuracy, "Watch");
    expect(parameterAnalysis.has("pH")).toBe(true);
    expect(parameterAnalysis.get("pH")).toContain("baseline");
  });

  it("names BOTH excursion directions when a parameter left the range at each end", () => {
    // The Algalita Pod's dissolved oxygen: a 23.32 mg/L peak and a 1.72 mg/L trough in the same
    // 30 days. The old wording printed the peak only, dropping the near-hypoxic number a reader
    // would actually act on.
    const do_ = param(fixedBaseline("dissolved_oxygen", "Dissolved Oxygen (mg/L)", "mg/L", 5, 8), {
      min: 1.72, max: 23.32, mean: 8.78, median: 8.68, pattern: "unknown",
    });
    const text = deterministicNarrative(report([do_]), noAccuracy, "Action Required")
      .parameterAnalysis.get("Dissolved Oxygen (mg/L)")!;
    expect(text).toContain("above it to 23.32 mg/L");
    expect(text).toContain("below it to 1.72 mg/L");
  });

  it("reports how much of the period a parameter spent outside baseline", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), {
      min: 6.0, max: 8.0, series: hourly([6.0, 6.2, 7.0, 7.0]), pattern: "unknown",
    });
    const text = deterministicNarrative(report([ph]), noAccuracy, "Watch").parameterAnalysis.get("pH")!;
    expect(text).toContain("50% of the period");
  });

  it("prints no stray space around a value whose parameter has no unit", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0, pattern: "unknown" });
    const text = deterministicNarrative(report([ph]), noAccuracy, "Watch").parameterAnalysis.get("pH")!;
    expect(text).toContain("above it to 9.00,");
    expect(text).not.toMatch(/ {2}/);
  });

  it("gives temperature its own N/A explanation instead of comparing it to a range", () => {
    const temp = param(noFixedBaseline("temperature", "Temperature (°F)", "°F"), { min: 60, max: 90, pattern: "unknown" });
    const { parameterAnalysis } = deterministicNarrative(report([temp]), noAccuracy, "Normal");

    // "unknown" pattern would normally count as held-steady-if-Normal, but N/A is not Normal,
    // so heldSteady is false and this parameter must still get a line.
    expect(parameterAnalysis.has("Temperature (°F)")).toBe(true);
    const text = parameterAnalysis.get("Temperature (°F)")!;
    // Wording widened with the operator-threshold baseline: "no fixed baseline" was accurate
    // when the reference table was the only source, but N/A now means no baseline from EITHER
    // source -- the doc's table or this device's registry thresholds.
    expect(text).toContain("No baseline is established");
    expect(text).not.toContain("site baseline.");
    expect(text).not.toMatch(/\b0-0\b/); // the internal placeholder must never be printed
  });

  it("carries the baseline note onto the parameter line, so the reader is told why there is none", () => {
    const baseline = {
      ...noFixedBaseline("temperature", "Temperature (°F)", "°F"),
      baselineNote: "No operator thresholds are configured for this device.",
    };
    const temp = param(baseline, { min: 60, max: 90, pattern: "unknown" });
    const { parameterAnalysis } = deterministicNarrative(report([temp]), noAccuracy, "Normal");

    expect(parameterAnalysis.get("Temperature (°F)")).toContain("No operator thresholds are configured");
  });

  it("calls an operator-set range a device threshold, not a site baseline", () => {
    // The two sources carry different authority: one is a reviewed table identical for every pod
    // in the tier, the other is one operator's number. The sentence has to say which it used.
    const baseline: ParameterBaseline = {
      ...fixedBaseline("temperature", "Temperature (°F)", "°F", 50, 80),
      baselineSource: "operator-threshold",
    };
    // "irregular" rather than "flat": a Normal + flat parameter is held-steady and gets no
    // analysis line at all (see heldSteady).
    const temp = param(baseline, { min: 60, max: 70, pattern: "irregular" });
    const { parameterAnalysis } = deterministicNarrative(report([temp]), noAccuracy, "Normal");

    const text = parameterAnalysis.get("Temperature (°F)")!;
    expect(text).toContain("operator-set threshold for this device");
    expect(text).not.toContain("site baseline");
  });

  it("still calls a reference-table range a site baseline", () => {
    const baseline: ParameterBaseline = {
      ...fixedBaseline("ph", "pH", "", 7.8, 8.3),
      baselineSource: "reference-table",
    };
    const { parameterAnalysis } = deterministicNarrative(
      report([param(baseline, { pattern: "irregular" })]), noAccuracy, "Normal",
    );

    expect(parameterAnalysis.get("pH")).toContain("site baseline");
  });

  it("gives turbidity a clarity band and supporting context, never an in/out-of-range verdict", () => {
    // mean 650 -> "Turbid"; the second half averages 200 above the first, clearing the trend
    // deadband (10% of the period mean) so the direction of change is reported.
    const turbidity = turbidityParam([500, 550, 600, 700, 750, 800]);
    const { parameterAnalysis } = deterministicNarrative(report([turbidity]), noAccuracy, "Normal");

    expect(parameterAnalysis.has("Turbidity (Relative)")).toBe(true);
    const text = parameterAnalysis.get("Turbidity (Relative)")!;
    expect(text).toContain("Turbid");
    expect(text).toContain("relative index mean 650.0");
    expect(text).toContain("rising across the period"); // the legitimate relative claim
    expect(text).toContain("provisional, uncalibrated conversion");
    // The claims a report must never make about a turbidity value.
    expect(text).not.toContain("site baseline");
    expect(text).not.toContain("NTU");
    expect(text).not.toMatch(/[Ee]xceedance|[Ee]levated reading|outside the/);
  });

  it("bands a period of all-zero turbidity as Clear rather than treating 0 as missing data", () => {
    const turbidity = turbidityParam([0, 0, 0, 0]);
    const { parameterAnalysis } = deterministicNarrative(report([turbidity]), noAccuracy, "Normal");

    const text = parameterAnalysis.get("Turbidity (Relative)")!;
    expect(text).toContain("Clear");
    expect(text).toContain("relative index mean 0.0");
    expect(text).toContain("held steady across the period");
    expect(text).not.toMatch(/no data|not available|missing/i);
  });

  it("bands a reading in the thousands without inventing an exceedance", () => {
    const turbidity = turbidityParam([2_400, 2_200, 2_000, 1_800, 1_600, 1_400]); // mean 1900, falling
    const { parameterAnalysis } = deterministicNarrative(report([turbidity]), noAccuracy, "Normal");

    const text = parameterAnalysis.get("Turbidity (Relative)")!;
    expect(text).toContain("Very turbid");
    expect(text).toContain("falling across the period");
    expect(text).not.toMatch(/[Ee]xceedance/);
  });

  it("names the bands a period spanned when min and max fall in different ones", () => {
    const turbidity = turbidityParam([0, 100, 900, 1_400]); // Clear -> Very turbid
    const { parameterAnalysis } = deterministicNarrative(report([turbidity]), noAccuracy, "Normal");

    expect(parameterAnalysis.get("Turbidity (Relative)")!)
      .toContain("The period spanned clear to very turbid conditions.");
  });

  it("keeps turbidity out of the excursion list, however turbid, and gives it its own bullet", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0 });
    const turbidity = turbidityParam([2_042, 2_042, 2_042]);
    const { summaryBullets } = deterministicNarrative(report([ph, turbidity]), noAccuracy, "Watch");

    // Only pH is named as having moved outside the site baseline.
    expect(summaryBullets[1]).toMatch(/^PH moved outside the site baseline/);
    expect(summaryBullets[1]).not.toContain("Turbidity");

    const clarity = summaryBullets.find((b) => b.startsWith("Turbidity (Relative):"))!;
    expect(clarity).toBeDefined();
    expect(clarity).toContain("Very turbid");
    expect(clarity).toContain("no");
    expect(clarity).toContain("operator range");
  });

  it("still reports turbidity in the all-clear summary -- silence would read as unmeasured", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { pattern: "flat" });
    const turbidity = turbidityParam([10, 10, 10]);
    const { summaryBullets } = deterministicNarrative(report([ph, turbidity]), noAccuracy, "Normal");

    expect(summaryBullets[0]).toContain("Overall status: Normal");
    expect(summaryBullets.join(" ")).toContain("Turbidity (Relative): Clear");
    // The all-clear line no longer over-claims on behalf of parameters that have no baseline.
    expect(summaryBullets.join(" ")).not.toContain("All parameters held within the site baseline");
  });

  it("does not mangle interior acronyms the way a naive capitalize() would", () => {
    const orp = param(fixedBaseline("orp", "ORP (mV)", "mV", 200, 400), { pattern: "flat" });
    const { parameterAnalysis } = deterministicNarrative(report([orp]), noAccuracy, "Normal");
    // Held steady (Normal + flat) so nothing is in the map -- force a non-steady case instead.
    expect(parameterAnalysis.has("ORP (mV)")).toBe(false);

    const orpElevated = param(fixedBaseline("orp", "ORP (mV)", "mV", 200, 400), { max: 500, pattern: "flat" });
    const { parameterAnalysis: pa2 } = deterministicNarrative(report([orpElevated]), noAccuracy, "Watch");
    const text = pa2.get("ORP (mV)")!;
    expect(text).not.toContain("orp");
    expect(text[0]).toBe(text[0].toUpperCase());
  });
});

describe("deterministicNarrative — recommendations", () => {
  it("gives routine-only recommendations when nothing is flagged", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { pattern: "flat" });
    const { recommendationsOperational, recommendationsInvestigative, recommendationsStakeholder } = deterministicNarrative(
      report([ph]), noAccuracy, "Normal",
    );
    expect(recommendationsOperational).toContain("No action needed");
    expect(recommendationsInvestigative).toBe("None required this period.");
    expect(recommendationsStakeholder).toContain("Routine report distribution");
  });

  it("escalates the stakeholder recommendation to authorities only when a High-severity event fired", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0 });
    const highEvent: WQEvent = {
      type: "Sewage", windowStartMs: 0, windowEndMs: 1, severity: "High",
      parameterMovements: "", interpretation: "", followUp: "", confidence: 0.7,
    };
    const { recommendationsStakeholder } = deterministicNarrative(report([ph], [highEvent]), noAccuracy, "Action Required");
    expect(recommendationsStakeholder).toContain("relevant authority");
  });

  it("adds a professional-referral escalation line for a high-severity, high-confidence event", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0 });
    const highEvent: WQEvent = {
      type: "Sewage", windowStartMs: 0, windowEndMs: 1, severity: "High",
      parameterMovements: "", interpretation: "", followUp: "", confidence: 0.7,
    };
    const { recommendationsStakeholder } = deterministicNarrative(report([ph], [highEvent]), noAccuracy, "Action Required");
    expect(recommendationsStakeholder).toContain("qualified water-quality professional");
  });

  it("does not escalate a High-severity event below the confidence floor", () => {
    // Same severity as the case above, but confidence sits below CONFIDENCE_FLOOR (0.5) -- the
    // same floor overallStatus uses to keep a weak finding off "Action Required". An inconclusive
    // finding must not tell someone to call an authority.
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0 });
    const weakHighEvent: WQEvent = {
      type: "Inconclusive", windowStartMs: 0, windowEndMs: 1, severity: "High",
      parameterMovements: "", interpretation: "", followUp: "", confidence: 0.3,
    };
    const { recommendationsStakeholder } = deterministicNarrative(report([ph], [weakHighEvent]), noAccuracy, "Watch");
    expect(recommendationsStakeholder).not.toContain("relevant authority");
    expect(recommendationsStakeholder).not.toContain("water-quality professional");
    expect(recommendationsStakeholder).toBe("Notify client.");
  });

  it("does not escalate a persistent-offset window, since those are capped at Moderate severity", () => {
    // events.ts caps a window covering most of the reporting period at "Moderate" severity even
    // at high confidence, specifically so a month-long baseline mismatch doesn't read as the most
    // severe finding in the report. Confirms the escalation line respects that cap too.
    const ph = param(fixedBaseline("ph", "pH", "", 7.8, 8.3), { max: 9.0 });
    const persistentEvent: WQEvent = {
      type: "Industrial", windowStartMs: 0, windowEndMs: 1, severity: "Moderate",
      parameterMovements: "", interpretation: "", followUp: "", confidence: 0.9,
    };
    const { recommendationsStakeholder } = deterministicNarrative(report([ph], [persistentEvent]), noAccuracy, "Watch");
    expect(recommendationsStakeholder).not.toContain("relevant authority");
    expect(recommendationsStakeholder).not.toContain("water-quality professional");
  });

  it("never emits remediation phrasing anywhere in the narrative -- escalation names who, not what to do", () => {
    const ph = param(fixedBaseline("ph", "pH", "", 6.5, 8.5), { max: 9.0 });
    const highEvent: WQEvent = {
      type: "Sewage", windowStartMs: 0, windowEndMs: 1, severity: "High",
      parameterMovements: "", interpretation: "", followUp: "", confidence: 0.9,
    };
    const sections = deterministicNarrative(report([ph], [highEvent]), noAccuracy, "Action Required");
    const allText = [
      ...sections.summaryBullets,
      ...sections.parameterAnalysis.values(),
      sections.recommendationsOperational,
      sections.recommendationsInvestigative,
      sections.recommendationsStakeholder,
    ].join(" \n ");
    // Remediation is a separate, legally-gated piece of work -- the narrative may say who to
    // involve, never what to do to the water or the system.
    expect(allText).not.toMatch(/\binstall\b|\bdose\b|\baerat|\bincrease flow\b|\bflush\b|\breduce\b|\badd\s+(chlorine|treatment)/i);
  });
});
