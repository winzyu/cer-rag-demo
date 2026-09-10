# Advice catalogue candidates — instrument health

Candidate entries for the operator-approved advice allowlist (`docs/RESPONSIBILITY.md`,
"Decided 2026-09-09"). This family covers the case where the **instrument**, not the water, is
the likely subject: biofouling, calibration intervals, a probe reading a physical impossibility,
a hardware fault flag, an unassessed cross-sensor check, and a pod that has gone silent.

Every entry is a draft for a human supervisor to approve, edit, or reject — none of this text is
wired into the product. Code selects an entry by its trigger; the model only phrases what it is
handed.

**Why this family fits `diy-hints` well.** Cleaning a probe or recalibrating on schedule is
low-risk, reversible, entirely within the operator's control, and needs no permit or chemical
beyond what a field water-quality kit already carries. It is also the one family directly
supported by the corpus: nine USGS National Field Manual (NFM) chapters and an EPA calibration
SOP exist specifically to tell someone how to maintain and calibrate this class of instrument.
Every other advice family has to reach outside the corpus for its content; this one mostly does
not.

**A split worth calling out up front.** The four Atlas Scientific datasheets in the corpus
(dissolved oxygen, ORP, pH, conductivity) give a recalibration **interval** and a probe
**specification** but no calibration **procedure** — no buffer values, no ZoBell solution, no
air-saturation step. Those live only in the USGS NFM chapters and the EPA SOP. INST-02 and INST-03
are built around that split deliberately.

---

## Summary table

| id | trigger (signal) | tier | grounding |
|---|---|---|---|
| INST-01 | Implausible reading on any metric, no hardware fault flag (`excluded_implausible > 0`) | education | corpus + code |
| INST-02 | Same as INST-01, or standing content for a future cal-date field | education | corpus |
| INST-03 | `calibrationStatus: "Review"` | diy-hints | corpus |
| INST-04 | Implausible reading, `dissolvedOxygen` specifically | diy-hints | corpus |
| INST-05 | Implausible reading, `ph` pinned at 0.000 / 14.000 | diy-hints | corpus |
| INST-06 | Implausible reading, `conductivity` at/below 0 µS/cm | diy-hints | corpus |
| INST-07 | Implausible reading, `orp` outside ±2000 mV | diy-hints | corpus |
| INST-08 | Sustained upward turbidity drift, no corroborating parameter change | diy-hints | corpus (forward-looking trigger) |
| INST-09 | Temperature baseline unusable (`operatorThresholds` rejection) | diy-hints | corpus + code |
| INST-10 | Device silent — no readings in a window that should hold recent data | escalation | code (+ CER referral) |
| INST-11 | `excluded_faulted > 0` (hardware's own fault flag, distinct from INST-01) | education | corpus + code |
| INST-12 | `sensorAgreementStatus` unassessed | education | corpus (forward-looking trigger) |

**12 candidates. 10 corpus-grounded (INST-01–09, 11–12), 1 primarily code/system-behavior grounded
(INST-10), 0 requiring outside web sourcing** — this family's material was in the corpus already;
no candidate here needed a web fetch to stand up. (Web search was used only for the "sourcing
candidates" section below, which proposes documents to add later, not evidence for these entries.)

---

## Candidates

### INST-01 — Implausible reading, any metric (rail, no fault flag)

- **Trigger:** A decoded reading for any of the six metrics falls outside that metric's
  `PLAUSIBLE_RANGES` entry (`src/devices/plausibility.ts`), and is counted in
  `excluded_implausible` (`src/report/buildReportInput.ts:159-160, 226-227`) — critically, **with
  no corresponding hardware error flag set** on that reading. This is the general case; INST-04
  through INST-07 are the metric-specific variants with their own diy-hints.
- **Applicable water-body types:** All.
- **Tier:** `education`.
- **Draft text:** "One or more readings from this instrument this period fell outside what that
  probe can physically produce in water, even though the probe's own diagnostic did not report a
  fault at the time — that combination is generally associated with a disconnected, shorted, or
  otherwise compromised sensor rather than with a true water condition."
- **CER referral:** none — informational only.
- **Evidence:**
  - `src/devices/plausibility.ts` (module docstring, lines 1–24): documents a verified live
    example on `dev:351077454569099` — `water_data["102"] = -1023` (a 10-bit ADC rail) decoded to
    **-1809.4 °F** with `rtdError = 0` ("hardware says the probe is FINE"), and that fourteen such
    readings exist on that pod across three months.
  - `src/report/buildReportInput.ts:242-249`: `calibrationStatus` is set to `"Review"` exactly
    when `implausible > 0`, with the note: *"reading(s) were sensor rails reported without a fault
    flag ... Inspect and recalibrate the affected probes; the hardware did not self-report these."*

### INST-02 — Recalibration interval, general

- **Trigger:** Forward-looking. The device registry does not currently carry a
  last-calibrated-date field, so this cannot fire from live data today; it is pre-registered for
  when one exists. In the interim it can be attached to the same signal as INST-01/INST-03
  (`calibrationStatus: "Review"`) as general context alongside the procedural entry.
- **Applicable water-body types:** All.
- **Tier:** `education`.
- **Draft text:** "Industrial water-quality probes of this kind are typically specified with an
  approximate recalibration interval by their manufacturer — commonly on the order of one year for
  probes that react chemically or electrochemically, and considerably longer for a probe that
  measures conductivity electrically — though manufacturers are explicit that actual use
  conditions can shorten or lengthen that interval."
- **CER referral:** none.
- **Evidence (Atlas Scientific datasheets, corpus):**
  - DO probe: *"~1 Year — Time before recalibration"* (`Industrial-DO-probe.pdf__610532812499`,
    claim `do-recal-interval-01`); *"Because every use case is different, there is no set schedule
    for recalibration."* (`Industrial-DO-probe.pdf__cc6df5ba5474`, `do-no-set-recal-schedule-01`).
  - ORP probe: *"~1 Year — Time before recalibration"* (`IORP_probe.pdf__5554782eea67`,
    `orp-recal-interval-01`); same no-set-schedule line (`IORP_probe.pdf__566989019e52`).
  - pH probe: *"~1 Year — Time before recalibration"* (`IpH_probe.pdf__d3fc1e169fc7`,
    `ph-recal-interval-01`); same no-set-schedule line (`IpH_probe.pdf__950607bd1cfd`).
  - Conductivity probe: *"~10 years — Time before recalibration"*
    (`EC_K_1.0_probe.pdf__e602012341c1`, `ec-recal-interval-01`).

### INST-03 — Calibration procedure lives outside the instrument's own datasheet

- **Trigger:** `calibrationStatus: "Review"` (same underlying signal as INST-01), phrased instead
  as a diy-hint toward the corpus's calibration procedure rather than an explanation of the flag.
- **Applicable water-body types:** All.
- **Tier:** `diy-hints`.
- **Draft text:** "Recalibrating these kinds of probes uses named reference standards — buffered
  pH solutions, a ZoBell solution for oxidation-reduction potential, and a conductivity standard —
  with the field steps described in standard water-quality field methods; a probe's own
  specification sheet typically states the recommended interval but not the calibration procedure
  itself, so the step-by-step belongs to a field methods manual, not the instrument manual."
- **CER referral:** none.
- **Evidence:**
  - EPA SOP, ORP calibration: *"Allow the calibration standard (a Zobell solution: read the
    warning on the label before ...)"* (`epa-sop-field-instrument-calibration-2010.pdf__dc5fead69969`,
    `epa-orp-zobell-01`); *"...temperature correction table usually found on the standard bottle
    or on the standard..."* (same chunk, `epa-orp-temp-table-01`).
  - EPA SOP, pH standards: three buffered standards bracketing the expected pH
    (`epa-sop-field-instrument-calibration-2010.pdf__86e2872125d1`, `epa-ph-three-standards-01`).
  - Atlas datasheets state an interval, not a procedure (see INST-02's citations) — the
    corpus-side gap this entry names directly.

### INST-04 — Dissolved oxygen reading outside the physically possible range

- **Trigger:** `excluded_implausible` includes a `dissolvedOxygen` reading — i.e. a decoded value
  outside `PLAUSIBLE_RANGES.dissolvedOxygen` (0–30 mg/L; `src/devices/plausibility.ts:63-68`,
  "beyond the solubility limit of oxygen in water").
- **Applicable water-body types:** All.
- **Tier:** `diy-hints`.
- **Draft text:** "A dissolved-oxygen reading outside the range that dissolved oxygen can
  physically occupy in water is a pattern consistent with the probe's membrane or internal
  electrolyte needing attention rather than with the water itself; these probes consume their
  electrolyte over time, and periodically replacing the membrane and electrolyte is a routine,
  low-risk maintenance step."
- **CER referral:** none.
- **Evidence (Atlas Scientific DO probe datasheet, corpus):**
  - *"Typically an industrial dissolved oxygen probe will last 2 years before the electrolyte is
    depleted (results will vary)."* (`Industrial-DO-probe.pdf__cc6df5ba5474`,
    `do-electrolyte-depletion-01`).
  - *"Best practice is to replace the electrolyte solution and membrane every 1 – 2 years."*
    (same chunk, `do-replace-electrolyte-membrane-interval-01`).
  - EPA SOP corroborates membrane condition as a live-calibration concern: the probe is inspected
    "for air bubbles and nicks" before use, and a ripped membrane requires replacement (USGS/EPA
    procedural claims, `epa-do-inspect-membrane-01`, `do-ripped-membrane-01`).

### INST-05 — pH reading pinned at the scale's own edge

- **Trigger:** `excluded_implausible` includes a `ph` reading at or beyond 0 or 14 (exclusive
  bounds — `src/devices/plausibility.ts:54-61`: *"0 and 14 are the ends of the scale itself. A
  probe reporting exactly 0.000 or 14.000 is reporting its rail, not water"*).
- **Applicable water-body types:** All.
- **Tier:** `diy-hints`.
- **Draft text:** "A pH reading pinned exactly at 0.000 or 14.000 is the scale's own end point
  rather than a water measurement, since natural water essentially never sits precisely on either
  edge; a pH probe's reference junction becoming fouled or contaminated is commonly addressed with
  a brief soak — a dilute acid rinse for mineral buildup, a mild detergent soak for oil or grease,
  or a dilute bleach soak for biological contamination — followed by a thorough rinse."
- **CER referral:** none.
- **Evidence (USGS NFM 6.4, pH, corpus):**
  - *"Soak the electrode (whether gel- or liquid-filled) in 0.1-M HCl for 30 minutes."*
    (`usgs-nfm-a6.4-ph.pdf__6e70ac8e24a4`, `ph-hcl-soak-01`).
  - Detergent soak for oil/grease contamination and bleach soak for bacterial contamination are
    given in the same section (`ph-detergent-soak-01`, `ph-bleach-soak-01`).
  - *"note whether stabilization of the electrode requires more than 2 to 3 minutes. Slow
    response times may indicate reduced electrode performance or a clogged reference junction."*
    (same chunk, `ph-stabilization-2-3-min-01`) — supporting context, not quoted in the draft
    text, since it is a bench-calibration observation this pipeline does not measure.

### INST-06 — Conductivity reading at or below the conductivity floor

- **Trigger:** `excluded_implausible` includes a `conductivity` reading at or below 0 µS/cm
  (exclusive minimum — `src/devices/plausibility.ts:75-86`: *"Zero is excluded, unlike ORP and
  turbidity: every natural water conducts (even lab-grade deionized water reads ~0.055 µS/cm), so
  an exact 0 is the probe's floor, not a measurement"*).
- **Applicable water-body types:** All (fresh, brackish, and marine all conduct above zero; the
  floor applies regardless of water type).
- **Tier:** `diy-hints`.
- **Draft text:** "A conductivity reading at or below 0 µS/cm is below the floor any natural water
  can produce, since even deionized water conducts weakly; documented sources list cell fouling,
  contamination, or a loose probe connection among the recognized sources of conductivity
  measurement error, so inspecting the cell for buildup and confirming a clean, secure connection
  is a reasonable first check."
- **CER referral:** none.
- **Evidence (USGS NFM 6.3, Specific Conductance, corpus):**
  - *"Additional sources of uncertainty when measuring specific conductance include calibration,
    preparation of standard solutions, fouling or contamination of the conductivity cell, and
    improper maintenance of the meter and probe."* (`usgs-nfm-a6.3-specific-conductance.pdf__d06365e8c6fd`,
    `sc-uncertainty-sources-list-01`).

### INST-07 — ORP reading outside the physically possible range

- **Trigger:** `excluded_implausible` includes an `orp` reading outside ±2,000 mV
  (`src/devices/plausibility.ts:70-73`, "outside the range an ORP electrode can develop").
- **Applicable water-body types:** All.
- **Tier:** `diy-hints`.
- **Draft text:** "An oxidation-reduction potential reading outside the range this kind of
  electrode can physically develop points to the instrument rather than the water; verifying the
  electrode against a ZoBell solution, read at its temperature-corrected value from the standard's
  own correction table, is the standard field check for this parameter."
- **CER referral:** none.
- **Evidence (EPA SOP §5.5, corpus):**
  - *"Allow the calibration standard (a Zobell solution: read the warning on the label before...)"*
    and the temperature-correction-table instruction
    (`epa-sop-field-instrument-calibration-2010.pdf__dc5fead69969`, `epa-orp-zobell-01`,
    `epa-orp-temp-table-01`).
  - If the manufacturer states the ORP sensor ships factory-calibrated, that factory calibration
    is itself verified against ZoBell solution before being trusted (`epa-orp-factory-cal-verify-01`,
    same chunk).

### INST-08 — Sustained turbidity drift consistent with fouling

- **Trigger:** Forward-looking. `buildReportInput.ts` currently tags every parameter's `pattern`
  as `"unknown"` (file docstring §1: *"Every parameter's `pattern` is set to 'unknown'"*), and
  `biofoulingStatus` is always left unset, rendering "Not assessed" — there is no live drift or
  biofouling detector today (`src/report/types.ts:186-199`). This entry is pre-registered for a
  detector defined as: the turbidity relative index, or its clarity band (`referenceRanges.ts`,
  `clarityBandFor`), trending upward across multiple report windows with no corresponding change
  in the other five parameters.
- **Applicable water-body types:** All.
- **Tier:** `diy-hints`.
- **Draft text:** "A turbidity reading that climbs steadily across multiple reporting periods
  without a matching change in the other measured parameters is a pattern consistent with
  material building up on the optical sensor rather than with the water becoming less clear;
  regularly cleaning the optical surface — commonly every two to four weeks for a continuously
  deployed instrument, more often where buildup is heavier — is the standard maintenance
  response."
- **CER referral:** none.
- **Evidence (USGS NFM 6.7, Turbidity, corpus):**
  - *"...should be approximately every 2 to 4 weeks. More frequent..."* [cleaning, where
    biofouling is apparent] (`usgs-nfm-a6.7-turbidity.pdf__0670bbdf7a56`,
    `tby-clean-frequency-2-4-weeks-01`).
  - *"Regular cleaning of optical surfaces. Use a lint-free cloth,..."* (same chunk,
    `tby-clean-optics-01`).
  - *"...surface of the instrument, tends to produce a negative bias when light [beams are
    blocked]"* — fouling's typical effect on the reading (`usgs-nfm-a6.7-turbidity.pdf__6155013556ef`,
    `tby-fouling-bias-01`).
  - *"Readings first appear stable, then begin to increase inexplicably • Check for moisture on
    cell wall"* — the troubleshooting table's own description of exactly this drift shape
    (`usgs-nfm-a6.7-turbidity.pdf__5bf774f777a4`, `tby-ts-readings-increase-01`).
  - **No hardware claim made or implied**: the draft text says nothing about NTU, FNU, depth
    rating, or response time — the corpus carries no turbidity instrument datasheet (see
    "Rejected," R5, and the "Sourcing candidates" section below).

### INST-09 — Temperature has no usable site-specific baseline

- **Trigger:** `temperatureThreshold()` in `src/report/operatorThresholds.ts` returns
  `usable: false` for the device (any of its six rejection reasons: `no-thresholds`, `missing`,
  `non-numeric`, `unset`, `inverted`, `implausible` — lines 60-76), which surfaces in the report as
  `hasFixedBaseline: false` and the flag `"N/A"` for temperature (`src/report/buildReportInput.ts`,
  `temperatureBaseline`).
- **Applicable water-body types:** All — the source document gives temperature no range for any
  water type.
- **Tier:** `diy-hints`.
- **Draft text:** "This device has no usable site-specific temperature range on file, so
  temperature readings cannot currently be judged as in or out of range; standard water-quality
  guidance treats temperature as climate- and season-dependent rather than a single fixed number,
  and calls for establishing a site-specific baseline — which an operator can do by setting a
  minimum and maximum temperature for this device."
- **CER referral:** none.
- **Evidence:**
  - *"Temperature Climate/season-dependent Climate/season-dependent Climate/season-dependent"* —
    the baseline reference table gives temperature no numeric range in any of its three water-body
    columns (`water-quality-metrics-source-of-truth.pdf__19b15475035b`, `sot-baseline-temp-01`).
  - *"Ranges are general guidance. Establish a site-specific baseline before treating deviations
    as events"* (same chunk, `sot-baseline-caveat-01`).
  - `src/report/operatorThresholds.ts` (module docstring) implements exactly this: it is "the
    bridge" between that document's instruction and the device registry's
    `thresholds.minTemperature`/`maxTemperature` fields, and rejects unusable values (e.g. an
    all-zero row, `min === max`) rather than printing a fabricated range.

### INST-10 — Device has gone silent

- **Trigger:** The device's most recent reading is older than the recent-data threshold this
  system already uses (`frontend/js/provenance.js:53`, `RECENT_MS = 24 * 60 * 60 * 1000`), so a
  query window that should hold current data returns none. Distinct from, but related to, the
  system's separate guard against reporting an empty query window as a literal `0` on all six
  metrics (`src/devices/metrics.ts`, `decodeAverages` docstring: *"An empty window returns literal
  zeros, not an error or an absent field... Read naively that says the water is anoxic, at pH 0,
  at 0 °F — a set of catastrophic readings rather than 'no data'"*).
- **Applicable water-body types:** All.
- **Tier:** `escalation`.
- **Draft text:** "This device has not returned any readings for longer than expected, including
  through a period that should hold recent data — that is a gap in reporting or connectivity at
  the pod, not a water reading of zero, and it is worth flagging to whoever manages this device's
  deployment so the cause can be confirmed."
- **CER referral:** "Clean Earth Rovers can help confirm whether a scheduled retrieval, a power or
  connectivity issue, or something else explains the gap."
- **Evidence:**
  - `frontend/js/provenance.js:301,311`: the dashboard already renders exactly this state —
    `"No readings in this window · pod silent since <date>"` — once a device's last reading is
    more than `RECENT_MS` (24 hours) old.
  - `src/devices/metrics.ts` (`decodeAverages` docstring): verified live against
    "Old Woman Creek 2026," which had "not reported for four days" and whose averages came back as
    all zeros — documented as the exact fabrication this entry's wording avoids repeating.
  - `docs/migration/DEVICE_API.md`: records "Old Woman Creek 2026" as `dev:351077454567580`,
    **"stale — last reading 2026-08-07, nothing in 4 days"** at the time of that document, and
    separately (line 612) notes that a plausible benign explanation (seasonal removal) exists but
    is not established by any source — the reason this entry's draft text names only the
    observation (no readings) and not a cause, matching Rejected R7 below.

### INST-11 — Hardware fault flag, distinct from an unflagged implausible reading

- **Trigger:** `excluded_faulted > 0` for a metric (`src/report/buildReportInput.ts:158,217,227`)
  — the probe's own error flag (`doError`, `orpError`, `phError`, `ecError`, `rtdError`,
  `turbError`; `src/devices/metrics.ts`, `METRICS` table) was set on the reading, so
  `decodeMetric` marked it invalid at the time it was taken (`valid: errorFlagValue === undefined
  || errorFlagValue <= 0`). This is the complementary case to INST-01: here, the hardware *did*
  report the fault.
- **Applicable water-body types:** All.
- **Tier:** `education`.
- **Draft text:** "Some readings this period were excluded because the probe's own diagnostic
  flag reported them as invalid at the time they were taken — a different signal than a reading
  that looked physically impossible with no flag set — and routine care such as cleaning probes
  and cable connections before use is a standard way to reduce this kind of fault."
- **CER referral:** none.
- **Evidence:**
  - `src/report/buildReportInput.ts`, `completenessNotes`: *"N excluded on the probe's own fault
    flag"* is reported as a distinct count from `excluded_implausible`.
  - EPA SOP: *"Prior to calibration, all instrument probes and cable connections must be cleaned
    and the battery [checked]..."* — stated as necessary because skipping this "can lead to
    erratic measurements" (`epa-sop-field-instrument-calibration-2010.pdf__a94d853fd809`,
    `epa-preclean-probes-01`).

### INST-12 — Cross-sensor / reference agreement not currently assessed

- **Trigger:** Forward-looking. `DataQualityCheck.sensorAgreementStatus` is always left unset in
  the live pipeline (`src/report/buildReportInput.ts:254-256`), rendering "Not assessed," with the
  note: *"cross-sensor agreement needs a second co-located pod or a grab-sample result to compare
  against"* (`src/report/buildReportInput.ts`, `sensorAgreementNotes`). Pre-registered for when
  `sensorAgreementStatus` is computed and returns `"Review"`.
- **Applicable water-body types:** All.
- **Tier:** `education`.
- **Draft text:** "Checking a field instrument's readings periodically against an independent
  reference — a certified reference thermometer, a grab sample, or a second co-located instrument
  — is standard field practice for catching a sensor that has quietly drifted; this deployment
  does not currently have a second reference on file to compare against, so that particular check
  has not been run."
- **CER referral:** none.
- **Evidence:**
  - USGS NFM 6.8 troubleshooting table: *"Check the temperature reading with a NIST-certified or
    NIST-traceable digital thermometer and replace the sensor if it does not meet accuracy
    standards."* (`usgs-nfm-a6.8-multiparameter-instruments.pdf__f09f4667e6ea`,
    `mp-t6-temperature-check-05`) — note the draft text deliberately does not repeat "replace the
    sensor," which would cross into asserting the probe is broken (see Rejected R1).
  - EPA SOP: the temperature verification procedure is exactly this kind of independent check —
    "A NIST-traceable thermometer and the instrument's temperature sensor are placed in the same
    water and both readings are allowed to stabilize before they are compared"
    (`epa-sop-field-instrument-calibration-2010.pdf__86e2872125d1`, `epa-temp-verify-nist-both-01`).
  - `src/report/types.ts:186-199` (`DataQualityCheck` docstring): explains why an unrun check must
    render as "Not assessed" rather than a clean result — the same principle this entry's draft
    text follows by saying the check "has not been run" rather than implying agreement was
    confirmed.

---

## Rejected

Each of the following was drafted and set aside; the rule it broke is named so the same ground is
not re-covered.

**R1 — "Your DO probe is broken and needs to be replaced."**
Breaks the rule against ever asserting a probe is broken. The honest framing (used in INST-04) is
that a reading pattern is outside what the instrument can physically produce or is consistent with
a known aging mechanism — the operator decides what that means for the hardware, not the
assistant.

**R2 — "Discard the implausible readings and report the corrected average."**
Breaks the rule against ever telling an operator to discard or adjust data. The corpus carries no
rule for which part of a record may be kept, and this catalogue exists specifically to prevent
inventing one. INST-01 and INST-11 describe what the flag means and stop there.

**R3 — "Recalibrate this pH probe now — its reading is outside the EPA's ±0.3 pH unit tolerance."**
Breaks the rule against stating a calibration tolerance the corpus does not give for the situation
at hand. The ±0.3 pH unit figure is the EPA SOP's **default post-calibration check criterion**,
which the SOP itself states applies only "when [a] project's quality assurance plan is silent" on
its own criteria (`epa-postcal-defaults-apply-when-01`) — and it is a bench check against a known
buffer during calibration, not a rule for judging a live field reading against an arbitrary
number. Presenting it as a universal live-deployment tolerance misstates what the source says.

**R4 — "Turbidity is climbing fast — this looks like an algal bloom starting. Contact us for
cleanup."**
Crosses out of the instrument-health family into environmental-event/bloom prediction, which
`docs/RESPONSIBILITY.md`'s operator-meeting reconciliation explicitly rejects in this form: the six
measured parameters cannot detect or forecast a bloom, and "an assistant that announces a coming
bloom is making the least defensible claim available to it." INST-08 stays on the instrument side
of that line — a fouling-consistent *pattern*, never a bloom prediction.

**R5 — "This reading is now above 50 NTU, well past the clear-water threshold."**
Breaks the "no turbidity hardware claims" rule. The corpus holds no datasheet establishing this
instrument reports in NTU rather than FNU, and the pipeline itself deliberately labels this row
"Turbidity (Relative)" with no unit for exactly that reason (`src/report/buildReportInput.ts`,
`PARAMETER_META` comment). INST-08 discusses direction of change only, never a unit or a numeric
threshold.

**R6 — "The conductivity probe's graphite plates never wear out, so this alert can be ignored."**
Breaks two rules at once. It names a specific vendor construction detail (graphite plates) rather
than staying generic, and it uses a true fact (a conductivity cell's plates are chemically inert
per the Atlas datasheet, `ec-no-recal-needed-01`) to tell the operator to disregard a live
data-quality flag — which is a step toward telling them how to treat the record, the same failure
mode R2 names.

**R7 — "This pod probably came out of the water for the season — that's why it's gone quiet."**
Invents a specific, unverified cause for a stale device. No source in this system — the device
registry, the corpus, or the report pipeline — can distinguish a seasonal pull from a power or
connectivity fault; `docs/migration/DEVICE_API.md` records the real case this is drawn from and is
explicit that the seasonal explanation "lowers the alarm" but does not resolve it. INST-10 reports
only the observation (no readings in a window that should hold them) and refers the operator to
confirm the cause, rather than supplying one.

---

## Sourcing candidates (not added, not ingested)

Two datasheet-shaped gaps were named in the assignment. Both were confirmed live during this
research pass; neither was downloaded or added to `documents/`, and no ingestion was run.

**Turbidity sensor datasheet.** The corpus's own gap notes (`usgs-nfm-a6.8-multiparameter-instruments.json`
summary) state directly: *"No turbidity unit-conversion guidance. FNU appears three times and NTU
once, with no statement of how or whether values from differing optical designs can be compared."*
DataPod's turbidity sensor is explicitly an unidentified-vendor bolt-on
(`src/devices/metrics.ts` comment: *"Not a stored measurement: the backend derives it from
`water_data.turbVolt`..."*), so no exact-match datasheet can be sourced for it. A same-class
reference part with a real, current, free, extractable datasheet:
- **DFRobot "Gravity: Analog Turbidity Sensor" (SKU SEN0189).** Wiki page confirms real,
  extractable spec text: response time "<500ms", analog output "0-4.5V", 5V DC supply
  (https://wiki.dfrobot.com/Turbidity_sensor_SKU__SEN0189). A PDF version also exists
  (https://media.digikey.com/pdf/data%20sheets/dfrobot%20pdfs/sen0189_web.pdf); this session's
  fetch tool could not render its text layer directly (returned raw PDF stream), so the HTML wiki
  page is the confirmed-readable source — whoever ingests this should verify the PDF's text layer
  independently, the way the existing Atlas datasheets were verified. This is a **same-class
  analog turbidity sensor**, not a claim that it is the part on the pod — it would close the
  general "how do low-cost analog turbidity probes behave and what do they NOT tell you"
  gap the corpus currently has zero coverage of, not stand in as this vendor's own spec.

**Temperature probe datasheet.** `src/devices/plausibility.ts` and `src/devices/metrics.ts`
identify the temperature reading's error flag as `rtdError` — an RTD (resistance temperature
detector) is the sensing element, and the Atlas Scientific DO probe bundles one, but no standalone
temperature-probe datasheet is in the corpus (only the DO, ORP, pH, and conductivity probe
datasheets are). A real, current, free, extractable candidate from the same manufacturer family
already represented in the corpus:
- **Atlas Scientific "Industrial PT-1000 Temperature Probe."** Product page confirms real spec
  text: cable length "3 Meters (10′)", response time "90% in 13s", accuracy
  "±(0.15 + 0.002·t)" (https://atlas-scientific.com/probes/industrial-pt-1000-temperature-probe/).
  A PDF datasheet also exists (https://files.atlas-scientific.com/Industrial-pt-1000-probe.pdf);
  as with the turbidity candidate, this session's fetch tool returned raw PDF stream rather than
  extracted text, so the product page is the confirmed-readable source pending independent PDF
  verification at ingestion time. This would fill the depth-rating/response-time gap this family's
  own candidates were deliberately careful not to claim (see INST-04, INST-05, INST-07 — none
  state a depth rating or response time for any probe, because the datasheet a claim like that
  would need is not in the corpus for temperature specifically, and does not exist at all for
  turbidity).

Neither candidate was downloaded, and nothing in `documents/` or the corpus was touched.

---

## Read on this family carrying a first release alone

This family alone could plausibly anchor a first `diy-hints` release, for three reasons that do
not hold to the same degree for the other three advice families:

1. **It needs the least outside sourcing.** All 12 candidates above draw on material already in
   the corpus; nothing here required a web fetch to write (the two web sources found are proposals
   for *future* corpus coverage, not evidence used in any candidate). An environmental-event family
   has to reach past "how to measure X" into "what a reading means for the ecosystem" or "who to
   call," which the corpus — nine measurement-method chapters and one calibration SOP — was never
   written to support.
2. **The risk profile is genuinely uniform across the set.** Every `diy-hints` entry above
   (INST-03 through INST-09) describes cleaning, a reference-standard check, or a registry field
   edit — reversible, non-chemical beyond what a field kit carries, and fully within the operator's
   own control. An environmental-event family's parallel actions (treating water, reporting a
   discharge, notifying an authority) do not clear that bar as cleanly, and several genuinely
   belong in `escalation` or `prescriptive` instead.
3. **The catalogue's own tier logic maps onto real pipeline states already.** `education` entries
   here explain a `DataQualityCheck` field that already exists in the type system
   (`calibrationStatus`, and — once built — `driftStatus`, `biofoulingStatus`,
   `sensorAgreementStatus`); `diy-hints` entries pair with `excluded_implausible` per metric, which
   the pipeline already computes live; `escalation` (INST-10) pairs with a state the frontend
   already detects and badges. Three of the twelve (INST-02, INST-08, INST-12) are honestly
   forward-looking — pre-registered content for a signal this pipeline does not compute yet — and
   are marked as such rather than dressed up as live.

The gap is not corpus coverage; it is that three of twelve triggers (INST-02, INST-08, INST-12)
need a detector or a registry field this pipeline does not have yet. That is a scoped follow-on
(a last-calibrated-date field, a real drift/biofouling detector reading real `pattern` data instead
of the current constant `"unknown"`, and a second-reference comparison), not a sourcing problem —
which is the opposite shape of gap the other three advice families are likely facing.
