# Advice candidates — Thermal and Saltwater intrusion

Draft entries for the operator-approved suggestion allowlist (`docs/RESPONSIBILITY.md`, "Decided
2026-09-09 — advice content comes from a prompt-carried allowlist"), scoped to the two event types
this pass owns: `Thermal` and `Saltwater intrusion`. Hypoxia/algal bloom, discharge events
(Sewage/Stormwater/Industrial/Acidic input), and instrument health are drafted elsewhere — nothing
below reaches into those.

**Read this before wiring the catalogue up to `src/report/events.ts` — it changes which entries can
ever fire.**

## Implementation note: `Saltwater intrusion` (and weak `Thermal`) never reaches `WQEvent.type` today

In `classify()`, the saltwater-intrusion branch is hardcoded to `confidence: 0.45`. In
`eventForWindow()`, any classification with `confidence < CONFIDENCE_FLOOR_FOR_CLASSIFICATION`
(`CONFIDENCE_FLOOR` = **0.5**, `types.ts`) has its `type` overwritten to `"Inconclusive"` before the
`WQEvent` is built — the `confidence` number is left alone, but the `type` field a catalogue would
key off is not. 0.45 is below 0.5 unconditionally, so **every** window `classify()` calls
`"Saltwater intrusion"` is emitted as `type: "Inconclusive"`. The same happens to the weak
temperature-alone `Thermal` branch (`confidence: 0.4`). Only the full thermal signature
(temp up + DO down + everything else flat, `confidence: 0.6`) survives with `type: "Thermal"`.

Concretely: as coded, a `WQEvent` with `type === "Saltwater intrusion"` cannot exist. Anything keyed
on that exact type string is dead code. This is very likely an oversight, not a deliberate design —
the file's own docstring calls this confidence band "moderate" and says intrusion/stormwater "stay
capped at moderate confidence even on a clean pattern match," which reads as "still assertable," not
"always downgraded." Compare `Stormwater`'s 0.5 branch, which sits exactly at the floor and survives
(`0.5 < 0.5` is false) — the asymmetry looks unintended.

I have not touched `events.ts` — out of scope for a docs-only task, and a fix there is a judgment
call (raise the saltwater-intrusion confidence, special-case it in the floor check, or something
else) that belongs to whoever owns that file. Flagging it here because **the candidates below are
drafted against the `EventType` the code declares, per the assignment**, and several are close to
useless until that gap closes. I've marked each affected entry and given a fallback trigger for it.

---

## Summary

| id | event type | tier | min severity | min confidence | water body |
|---|---|---|---|---|---|
| `thermal-edu-no-fixed-baseline` | Thermal | education | Low | 0.4 | any |
| `thermal-edu-persistent-offset` | Thermal | education | Moderate | 0.4 | any |
| `thermal-edu-marine-buffering` | Thermal | education | Low | 0.4 | Marine, Estuarine |
| `thermal-escalation-sustained-signature` | Thermal | escalation | High | 0.6 | any |
| `thermal-diy-check-regional-weather` | Thermal | diy-hints | Low | 0.4 | any |
| `salt-edu-tidal-rhythm` | Saltwater intrusion | education | Low | 0.45 | Estuarine, Brackish |
| `salt-edu-persistent-offset` | Saltwater intrusion | education | Moderate | 0.45 | any |
| `salt-escalation-non-tidal-rise` | Saltwater intrusion | escalation | Moderate | 0.45 | Freshwater, Brackish |
| `salt-diy-check-tide-drought-gauge` | Saltwater intrusion | diy-hints | Low | 0.45 | any |

9 candidates: 5 Thermal, 4 Saltwater intrusion. Tier split: 5 education, 2 escalation, 2 diy-hints —
weighted toward education on purpose (see the note in the assignment about this event family being
frequently natural and non-actionable).

---

## Thermal

### `thermal-edu-no-fixed-baseline`

- **Event type:** Thermal
- **Water body:** any
- **Min severity / confidence:** Low / 0.4
- **Tier:** education
- **Draft text:** "Temperature doesn't have one fixed 'normal' range the way the other measured
  parameters do — what's typical depends on the season and this specific site, so a warm reading is
  weighed against what's expected here and now, not a single universal number."
- **CER referral:** none
- **Evidence (corpus, preferred):** `water-quality-metrics-source-of-truth.json`, chunk
  `water-quality-metrics-source-of-truth.pdf__19b15475035b` (claim `sot-baseline-temp-01`): *"Temperature
  Climate/season-dependent Climate/season-dependent Climate/season-dependent"* — the Baseline
  Reference Ranges table gives no numeric temperature range for any water type. Same chunk, claim
  `sot-baseline-caveat-01`: *"Ranges are general guidance. Establish a site-specific baseline before
  treating deviations as events."* This is also encoded in the shipped code:
  `src/report/referenceRanges.ts` omits `temperature` from `BASELINE_RANGES` entirely and comments
  "Temperature has NO fixed baseline... 'Climate/season-dependent' for all three water types."
- **Trigger note:** fires on the one `Thermal` branch that does survive the confidence floor
  (temp-alone, 0.4) as well as the full-signature branch (0.6) — both are legitimately `Thermal`
  in code, so this entry is unaffected by the gap above.

### `thermal-edu-persistent-offset`

- **Event type:** Thermal
- **Water body:** any
- **Min severity / confidence:** Moderate / 0.4
- **Tier:** education
- **Draft text:** "This reading has stayed elevated for nearly the whole reporting period rather
  than spiking and coming back down, which points more toward normal seasonal warming — or a site
  baseline that no longer matches this location — than toward a single incident."
- **CER referral:** none
- **Evidence (corpus):** `events.ts` itself implements this distinction — `PERSISTENT_WINDOW_SHARE`
  (0.8) reclassifies a window covering most of the report as a baseline offset rather than a
  discrete event, and caps its severity at Moderate specifically so duration alone can't read as the
  most severe finding in the report. Grounded in the same source-of-truth passage as the entry
  above (`sot-baseline-caveat-01`, "site-specific baseline") plus chunk
  `...__5c7643fce7a3` (claim `sot-seasonal-cycle-01`): *"Compare any reading to the same season's
  baseline."*
- **Trigger note:** relies on the `interpretation` text's "sustained offset spanning the whole
  reporting period" wording (`events.ts`, `departureClause`), since `WQEvent` has no dedicated
  `persistent: boolean` field — the catalogue selector needs to either pattern-match that string or
  `events.ts` needs to expose the flag structurally. Worth a one-line follow-up regardless of
  Thermal/Saltwater intrusion; both events use the same persistent-window code path.

### `thermal-edu-marine-buffering`

- **Event type:** Thermal
- **Water body:** Marine, Estuarine
- **Min severity / confidence:** Low / 0.4
- **Tier:** education
- **Draft text:** "Coastal and marine water tends to change temperature more slowly than a small
  freshwater pond or stream, and a swing here is often tied to the tide bringing in water from a
  different depth or area rather than a local heat source."
- **CER referral:** none
- **Evidence (corpus):** chunk `...__c823e6132551` (claim `sot-temp-fresh-vs-salt-01`): *"Freshwater
  bodies are smaller and respond faster to air temperature and runoff. Coastal/marine water is more
  thermally buffered but driven by tidal exchange and upwelling."* Same chunk, claim
  `sot-temp-drivers-01`: *"Solar input, air temperature, depth/stratification, tidal and current
  mixing, freshwater inflow, discharges."*

### `thermal-escalation-sustained-signature`

- **Event type:** Thermal
- **Water body:** any
- **Min severity / confidence:** High / 0.6
- **Tier:** escalation
- **Draft text:** "Temperature rose while dissolved oxygen fell in the pattern usually associated
  with a heat source entering the water, and it held for more than half a day rather than settling
  back on its own daily rhythm. If you'd like a second set of eyes, your local environmental or
  water-quality agency can advise on next steps."
- **CER referral:** "Clean Earth Rovers can pull the full reading history for this window if that's
  useful context to share with them."
- **Evidence (corpus):** chunk `...__3ad84c74c7db` (claim `sot-sig-thermal-primary-01`): *"Temperature
  rise with proportional DO decline; other chemistry flat"* — this is exactly the signature
  `classify()`'s 0.6-confidence Thermal branch checks (`temp === "up" && do_ === "down" && orp
  === undefined && cond === undefined && ph === undefined && turb === undefined`). Chunk
  `...__c823e6132551` (claim `sot-thermal-pollution-01`): *"Thermal pollution (power-plant cooling
  water, hot-pavement stormwater) is itself an event type."*
- **Trigger note:** the one Thermal branch that reliably produces `type: "Thermal"` at ≥0.5
  confidence and can reach High severity (duration > 12h) — no floor issue here.

### `thermal-diy-check-regional-weather`

- **Event type:** Thermal
- **Water body:** any
- **Min severity / confidence:** Low / 0.4
- **Tier:** diy-hints
- **Draft text:** "Before treating a warm reading as unusual, it can help to check whether the wider
  area has been through an unusually hot stretch of weather — a public streamflow or water-
  temperature dashboard can show whether nearby waters moved the same way at the same time."
- **CER referral:** none
- **Evidence (public source):** USGS, *"Where can I get real-time and historical streamflow
  information?"* — describes the USGS National Water Dashboard
  (https://dashboard.waterdata.usgs.gov/): *"Zoom in and hover your cursor over a station to get a
  quick real-time reading."*
  https://www.usgs.gov/faqs/where-can-i-get-real-time-and-historical-streamflow-information
- **Rule check:** checking a public dashboard is reversible, free, requires no permit, no chemical,
  no in-water work — satisfies the diy-hints restriction.

---

## Saltwater intrusion

### `salt-edu-tidal-rhythm`

- **Event type:** Saltwater intrusion
- **Water body:** Estuarine, Brackish
- **Min severity / confidence:** Low / 0.45
- **Tier:** education
- **Draft text:** "In tidal water, conductivity naturally rises and falls with the tide as salt
  water and fresh water mix on a daily schedule — a rise that lines up with the tide's timing is
  that normal mixing at work, not an incoming discharge."
- **CER referral:** none
- **Evidence (corpus):** chunk `...__5c7643fce7a3` (claim `sot-tidal-cycle-01`): *"An EC change that
  repeats on the tidal clock is mixing, not a discharge."* Chunk `...__57fe7a67fc10` (claim
  `sot-ec-pollution-01`): *"Sudden EC shifts flag saltwater intrusion, road-salt runoff,
  industrial/chemical discharge, or sewage. In estuaries, EC normally tracks the tide"* — and the
  event-test line, same chunk as the first, claim `sot-event-test-01`: *"A pollution event typically
  appears as a step-change or sustained excursion that breaks the expected diel/tidal rhythm — not
  a smooth oscillation."*
- **Trigger note — the floor gap applies directly here.** As coded, this can only fire if the
  catalogue also matches `Inconclusive` events whose `interpretation` text still names the
  saltwater-intrusion signature (the rationale string survives the downgrade even though `type`
  doesn't), or if `events.ts` is changed so 0.45 doesn't auto-downgrade. Until then this entry has
  no live trigger under `type === "Saltwater intrusion"`. Flagging rather than fixing — see the note
  at the top of this document.

### `salt-edu-persistent-offset`

- **Event type:** Saltwater intrusion
- **Water body:** any
- **Min severity / confidence:** Moderate / 0.45
- **Tier:** education
- **Draft text:** "Conductivity has stayed elevated for nearly the whole reporting period rather
  than moving around a single event, which more often means the site's baseline doesn't match this
  location's actual water chemistry than that saltwater is actively intruding — local conditions can
  run measurably different from a generic reference range."
- **CER referral:** none
- **Evidence (corpus):** chunk `...__19b15475035b` (claim `sot-baseline-ec-01`): *"(EC) 50–1,500
  μS/cm ~1,000–35,000 μS/cm ~45,000–55,000 μS/cm (~35 PSU)"* — the three-tier baseline conductivity
  table — plus `sot-baseline-caveat-01` (above): *"Ranges are general guidance. Establish a
  site-specific baseline before treating deviations as events."* This is the documented behaviour
  behind the real Southern California deployment: 54,100–60,200 µS/cm against a stated marine normal
  of 40,000–50,000, which the assignment notes as "an open question for the operator, not a software
  bug" — this entry is the assistant's version of that same framing.
- **Trigger note:** same floor gap as above; also relies on the same `interpretation`-text
  "persistent" wording as `thermal-edu-persistent-offset`.

### `salt-escalation-non-tidal-rise`

- **Event type:** Saltwater intrusion
- **Water body:** Freshwater, Brackish
- **Min severity / confidence:** Moderate / 0.45
- **Tier:** escalation
- **Draft text:** "Conductivity rose well outside the normal range for this site without the daily
  tidal rhythm that would explain a natural cause. That combination is worth mentioning to your
  local water-management or environmental agency, who can check regional streamflow, groundwater,
  or drought conditions."
- **CER referral:** "Clean Earth Rovers can help pull the full reading history if it's useful to
  share with them."
- **Evidence (corpus):** chunk `...__3ad84c74c7db`, claim `sot-sig-saltwater-intrusion-01`: *"The
  saltwater intrusion signature is EC strongly up with temperature, DO, ORP and turbidity little
  changed and pH flat to slightly up, with the EC rise correlated with tidal phase, drought, or
  sea-level conditions."* (Note: the JSON `quote` field for this claim captures only the matrix's
  arrow glyphs — `"intrusion → → → ↑↑ →/↑ →"` — not prose; the sentence above is the claims file's
  own paraphrase of that table row, flagged here for transparency rather than presented as a
  verbatim PDF quote.) Verbatim supporting quote from the same document, chunk
  `...__3ad84c74c7db`, claim `sot-ec-source-fingerprint-01`: *"the direction of an EC change tells
  you whether freshwater (rain, runoff, groundwater) or saline/ionic input"* is driving it.
- **Evidence (public source, corroborating):** USGS New Jersey Water Science Center, *"Saltwater
  Intrusion and Sea Level Rise Monitoring"*: *"During extended periods of low flow, saltwater can
  move upstream, which can threaten drinking-water supplies in the basin."*
  https://www.usgs.gov/centers/new-jersey-water-science-center/science/saltwater-intrusion-and-sea-level-rise-monitoring
- **Trigger note:** same floor gap — this is the entry most worth fixing the gap for, since it is
  the escalation case (a freshwater/brackish site with an unexplained EC rise) closest to something
  an operator should actually act on.

### `salt-diy-check-tide-drought-gauge`

- **Event type:** Saltwater intrusion
- **Water body:** any
- **Min severity / confidence:** Low / 0.45
- **Tier:** diy-hints
- **Draft text:** "It can help to compare the timing against a public tide chart or a regional
  drought/streamflow monitor for the area — if the rise lines up with high tide or a dry stretch
  upstream, that supports a natural, weather- and tide-driven cause rather than a one-off event."
- **CER referral:** none
- **Evidence (public source):** NOAA CO-OPS, *Tides & Currents*, water level info page: *"Real-time
  water level information updated every 6 minutes"* and *"official tidal predictions for the
  nation."* https://tidesandcurrents.noaa.gov/water_level_info.html — and USGS WaterWatch / National
  Water Dashboard (streamgage-based, real-time, public), same USGS FAQ page cited above:
  https://www.usgs.gov/faqs/where-can-i-get-real-time-and-historical-streamflow-information
- **Rule check:** checking two free public data sources; reversible, no permit, no chemical, no
  in-water work.

---

## Rejected

| draft (paraphrased) | event | rule broken |
|---|---|---|
| "Temperatures above 89°F become lethal to many freshwater fish species, so a reading this high warrants immediate concern." | Thermal | **No health/safety or ecological-harm-threshold claims.** The corpus carries no such threshold and the assignment calls this out by name as the exact unsupported claim to avoid. *(Most interesting rejection — it's the one the assignment pre-flagged, and it's also the most tempting to write, since "how hot is too hot for fish" is the very first question an operator would ask.)* |
| "This pattern is consistent with a nearby industrial facility discharging heated cooling water without a permit." | Thermal | **No prediction — only description of what was measured.** Naming a specific unverified cause (a particular facility, a permit violation) goes past what six generic parameters can establish and is accusatory besides. |
| "This saltwater intrusion is likely to worsen over the coming weeks as drought conditions continue, so plan for permanently higher salinity." | Saltwater intrusion | **No prediction.** Forecasts a future trend rather than describing the measured window. |
| "Move the pod to a shadier or cooler part of the water body to get a more typical reading." | Thermal | **diy-hints must be low-risk and reversible without permits or in-water work.** Relocating a moored deployment is not a quick, no-cost, reversible action — it commonly needs marina/harbor mooring authorization, which is functionally a permit. |
| "Add a small aerator or de-icing/circulation unit near the pod to help stabilize temperature." | Thermal | **Nothing requiring chemicals, permits, or in-water construction may be diy-hints.** Installing equipment in the water is in-water construction. |
| "Check whether the conductivity probe shows biofouling or drift that could be inflating the reading." | Saltwater intrusion | **Out of scope for this assignment.** A real and reasonable thing to check, but it's instrument-health territory (owned by another agent per the brief), not a regime-event interpretation — including it here would be drafting outside the two owned event types. |

6 rejected.

---

## Sourcing candidates (not ingested — flagged only)

Two public documents would strengthen this specific pair of event types beyond what's already in
the corpus, if the catalogue owner wants to close the gap between "generic public source" and
"corpus-grounded" citations above:

- **USGS Techniques and Methods 9-A6.1, "Temperature" (2024)** — already in the corpus
  (`eval/claims/usgs-nfm-a6.1-temperature.json`), but its claim inventory is almost entirely
  measurement-procedure (probe handling, equilibration, QA) rather than natural-variation framing.
  No action needed — it's already ingested — noting only that it did **not** turn out to be a useful
  source for the diel/seasonal-framing claims above; those came from the source-of-truth doc
  instead.
- **USGS Fact Sheet 2018–3022 / South Atlantic Water Science Center Coastal Drought Index
  material** (found via search: https://pubs.usgs.gov/fs/2018/3022/fs20183022.pdf) — a short,
  free, current USGS fact sheet specifically on real-time salinity monitoring and a
  drought-linked salinity index for tidal rivers. Dense in conductivity/salinity and explicit
  about the drought–tide–intrusion relationship the source-of-truth doc only mentions in one
  matrix cell. Worth a look if `salt-escalation-non-tidal-rise` and `salt-edu-persistent-offset`
  are judged to need a second, deeper citation once the confidence-floor gap is fixed and this
  event type actually starts firing.

---

## Referral wording convention

Where used, the referral line is deliberately soft ("can help," "if useful") rather than a call to
action — it offers Clean Earth Rovers as a source of the reading history, not as the fixer of the
underlying water condition, consistent with `docs/RESPONSIBILITY.md`'s reworked-referral guidance
("Detection, never prophecy") and the operator-meeting note that genericness is a feature, not a
gap ("gives operators freedom to find their own contractors and solutions").
