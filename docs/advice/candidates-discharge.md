# Candidate advice entries — discharge & contamination events

Owner scope: `Sewage`, `Stormwater`, `Industrial`, `Acidic input` (the four `EventType` values in
`src/report/types.ts` that can imply a regulatory, public-health, or third-party-blame question).
Hypoxia/algal bloom, thermal/saltwater intrusion, and instrument health belong to other agents and
are not drafted here.

Drafted against `classify()` in `src/report/events.ts` as it exists today, not against the
Pollution Event Signature Matrix in isolation — see the confidence-gating note below, which
changes what two of these four event types can actually do in production.

## Confidence gating — read this before the table

`eventForWindow` downgrades any classified event to `"Inconclusive"` whenever
`confidence < CONFIDENCE_FLOOR` (0.5, `src/report/types.ts`), **before** an event ever reaches
`WQEvent.type`. Walking `classify()`'s branches for this family:

| Event type | Branch confidence | Survives the 0.5 floor as its named type? |
|---|---|---|
| Sewage | 0.7 (all four parameters match) or 0.5 (EC missing) | Yes, both branches |
| Stormwater | 0.5 (turbidity + EC both move) or 0.4 (turbidity alone) | Only the 0.5 branch; the 0.4 branch always becomes `Inconclusive` |
| Acidic input | 0.55 (fixed, one branch) | Yes, always |
| **Industrial** | **0.3 (fixed, one branch)** | **No — always < 0.5, so `WQEvent.type` is never `"Industrial"` under the current classifier** |

That last row matters for what follows: any catalogue entry keyed on `event.type === "Industrial"`
is currently unreachable — the code's own comment calls this branch a low-confidence fallback ("a
fallback classification, not a confident one"), and the floor logic means it never survives as
that type. I drafted Industrial entries anyway, because the assignment is content ownership for
the event type, not a code fix, but I flag this as an engineering item, not silently patch around
it with a lower threshold of my own invention. See the Industrial section for the specific note.

Separately, `eventForWindow` uses a second internal threshold — `confidence < 0.6` sets
`followUp: "Grab sample"` (tentative) vs. `>= 0.6` sets `"Notify stakeholder"`. Only Sewage's
strong (0.7) branch ever crosses that line for this family; Stormwater (0.5) and Acidic input
(0.55) never do. I used this as the basis for gating `escalation`-tier text: where the pipeline's
own logic treats a classification as tentative, the draft text says so rather than asserting
confidence the detector itself doesn't have.

## Summary table

| id | event type | tier | water body | min severity | min confidence |
|---|---|---|---|---|---|
| `disc-sewage-edu-01` | Sewage | education | Any | Low | 0.5 |
| `disc-sewage-esc-01` | Sewage | escalation | Any | Moderate | 0.5 |
| `disc-storm-edu-01` | Stormwater | education | Any | Low | 0.5 |
| `disc-storm-diy-01` | Stormwater | diy-hints | Any | Low | 0.5 |
| `disc-storm-esc-01` | Stormwater | escalation | Any | Moderate | 0.5 |
| `disc-indus-edu-01` | Industrial | education | Any | Low | 0.3† |
| `disc-indus-esc-01` | Industrial | escalation | Any | Moderate | 0.3† |
| `disc-acid-edu-01` | Acidic input | education | Any | Low | 0.55 |
| `disc-acid-esc-01` | Acidic input | escalation | Any | Moderate | 0.55 |

† Industrial's only branch confidence is 0.3; see the gating note above — under the current
classifier this pair cannot fire. Confidence is recorded at the value `classify()` actually
produces, not inflated to make the entry reachable.

No `diy-hints` entry is proposed for Sewage, Industrial, or Acidic input. See the closing
discussion — this is a considered omission, not an oversight.

---

## Sewage

### `disc-sewage-edu-01` (education)

- **Water body:** Any
- **Min severity:** Low · **Min confidence:** 0.5
- **Draft text:** "This window shows dissolved oxygen and ORP falling together while turbidity
  rose — a pattern the reference material associates with organic loading or a sanitary
  discharge, rather than normal day-to-day variation."
- **CER referral:** "Clean Earth Rovers support can pull the full sensor history for this window
  if that would help."
- **Evidence (corpus):** `water-quality-metrics-source-of-truth.pdf`, claim `sot-sig-sewage-primary-01`
  — *"DO crash + ORP crash + EC rise + turbidity rise, not tied to time of day"* — and
  `sot-matrix-reading-01` — *"DO and ORP falling together while EC and turbidity rise is a far
  more specific signal pointing to an organic/sewage source."* Corroborated by
  `sot-orp-early-warning-01` — *"A drop toward or below zero is a strong signal of organic
  loading, sewage, or decomposition."* This matrix row's arrow cells extracted cleanly (per
  `eval/claims/water-quality-metrics-source-of-truth.json` summary notes: Sewage is one of the
  three rows *not* flagged as damaged), so no second-source check was strictly required, but one
  is cited below regardless because this is the highest-liability entry in the set.
- **Evidence (public):** EPA CADDIS, [Urbanization – Wastewater Inputs](https://www.epa.gov/caddis/urbanization-wastewater-inputs)
  — *"Decreased dissolved oxygen (increased biological oxygen demand)"* and *"Increased dissolved
  solids (e.g., chloride, sulfate, specific conductance)"* as effects of wastewater input.

### `disc-sewage-esc-01` (escalation)

- **Water body:** Any
- **Min severity:** Moderate (>3 hr excursion) · **Min confidence:** 0.5
- **Draft text:** "A pattern consistent with a sanitary or organic discharge signature has
  persisted for several hours. Your local water or sewer utility, or your state environmental
  agency, is the right point of contact to look into a signature like this."
- **CER referral:** "If it helps that conversation, Clean Earth Rovers can provide the raw
  readings and timestamps for this window."
- **Evidence (corpus):** Same as `disc-sewage-edu-01`.
- **Evidence (public):** EPA, [How to Report Spills and Environmental Violations](https://www.epa.gov/pesticide-incidents/how-report-spills-and-environmental-violations)
  — *"Many issues are handled at the local level"* and the guidance to contact local government
  first, escalating to the *"state environmental agency"* if needed. This is the source for
  naming "who to involve" generically rather than inventing a contact path.

---

## Stormwater

### `disc-storm-edu-01` (education)

- **Water body:** Any
- **Min severity:** Low · **Min confidence:** 0.5
- **Draft text:** "Turbidity rose alongside a shift in conductivity during this window — a pattern
  consistent with runoff entering the water after rain, rather than a steady chemical signature."
- **CER referral:** none (low-stakes enough not to need one).
- **Evidence (corpus):** `sot-sig-stormwater-01` — *"Sharp turbidity spike coincident with
  rainfall; EC shifts (drops in marine, may spike in fresh from road salt)"*. This row's arrow
  cells are flagged damaged in the extraction notes, so per the assignment's instruction it is
  checked against a second source below rather than trusted alone.
- **Evidence (public):** EPA archive, [5.5 Turbidity — Monitoring & Assessment](https://archive.epa.gov/water/archive/web/html/vms55.html)
  — *"Turbidity often increases sharply during a rainfall, especially in developed watersheds,
  which typically have relatively high proportions of impervious surfaces."* Independently
  confirms the runoff-turbidity link the damaged matrix row asserts.

### `disc-storm-diy-01` (diy-hints)

- **Water body:** Any
- **Min severity:** Low · **Min confidence:** 0.5
- **Draft text:** "If you have access to a local rainfall or tide record, comparing it against
  this window's timestamp is a quick way to see whether the timing lines up with runoff."
- **CER referral:** none.
- **Why this clears the diy-hints bar:** it is a record-comparison the operator does at a desk —
  no chemicals, no permit, no in-water action, nothing to reverse because nothing physical is
  touched. It also matches what the detector itself is honest about needing: `events.ts`'s own
  header comment says confirming Stormwater "needs tidal-stage/rainfall context this pipeline
  doesn't have."
- **Evidence (corpus):** `sot-sig-stormwater-01` (rainfall coincidence is the matrix's own
  confirming signal) plus the `events.ts` code comment on the Stormwater/Saltwater-intrusion
  confidence cap (both point at rainfall/tide context as the missing confirmation step, not
  something this codebase invents).

### `disc-storm-esc-01` (escalation)

- **Water body:** Any
- **Min severity:** Moderate · **Min confidence:** 0.5
- **Draft text:** "A sustained turbidity and conductivity pattern like this is consistent with
  storm or urban runoff. If it recurs or holds for a long window, your local stormwater or public
  works authority is generally the right party to loop in."
- **CER referral:** "Clean Earth Rovers can export the readings for this window if you want to
  share them."
- **Evidence (corpus):** Same as `disc-storm-edu-01`.
- **Evidence (public):** Same EPA VMS 5.5 page. No source names "public works" specifically as
  the contact — that phrasing is generic enough (a municipal function that exists in essentially
  every jurisdiction with storm drains) that it does not need a citation of its own, but flag it
  for the reviewer: unlike the sewage escalation line, this contact suggestion is my own
  generalization, not a direct quote.

---

## Industrial

### `disc-indus-edu-01` (education)

- **Water body:** Any
- **Min severity:** Low · **Min confidence:** 0.3 (see gating note — currently unreachable)
- **Draft text:** "Conductivity, pH, or ORP shifted abruptly with no daily or tidal rhythm to
  explain it. That pattern doesn't point to one specific cause — the reference material treats it
  as a catch-all for chemistry-driven inputs once other explanations are ruled out."
- **CER referral:** "Clean Earth Rovers support can help pull additional context for this window."
- **Evidence (corpus):** `sot-sig-industrial-01` — *"Abrupt step-changes in EC and/or pH and/or
  ORP with no diel or tidal explanation."* Flagged damaged in extraction (arrow cells missing),
  prose-only claim, checked against a second source below.
- **Evidence (public):** EPA archive, [5.9 Conductivity — Monitoring & Assessment](https://archive.epa.gov/water/archive/web/html/vms59.html)
  — *"Significant changes in conductivity could then be an indicator that a discharge or some
  other source of pollution has entered a stream."* Independently confirms an unexplained
  conductivity step-change as a general discharge indicator, without naming an industry.

### `disc-indus-esc-01` (escalation)

- **Water body:** Any
- **Min severity:** Moderate · **Min confidence:** 0.3 (see gating note — currently unreachable)
- **Draft text:** "This step-change pattern in conductivity, pH, or ORP doesn't match a more
  specific known signature, which is itself worth noting. If it persists, your state
  environmental agency is generally the right party to help interpret it."
- **CER referral:** "Clean Earth Rovers can provide the underlying readings on request."
- **Evidence:** same as `disc-indus-edu-01`, plus the EPA reporting-path source used for
  `disc-sewage-esc-01`.
- **Engineering note carried on this entry specifically:** per the gating table above, no
  `WQEvent` in the current pipeline can have `type === "Industrial"` — `classify()`'s only
  Industrial branch returns confidence 0.3, which `eventForWindow` always downgrades to
  `"Inconclusive"` before this entry could ever be selected. This pair is content-complete and
  approvable on its merits, but wiring it to fire requires an engineering decision (raise the
  branch confidence, or key advice selection off something other than the post-floor `type`
  field) that is out of scope for this document. Flagging it here so it isn't silently lost.

---

## Acidic input

### `disc-acid-edu-01` (education)

- **Water body:** Any
- **Min severity:** Low · **Min confidence:** 0.55
- **Draft text:** "pH dropped while conductivity rose during this window — a pairing consistent
  with an acidic input, such as acid mine drainage or an acidic effluent, rather than the normal
  daily swing biological activity produces."
- **CER referral:** "Clean Earth Rovers support can help pull the full history for this window."
- **Evidence (corpus):** `sot-sig-acidic-01` — *"pH crash paired with EC rise (dissolved
  metals/sulfate)"*. This is the row the assignment specifically calls out as damaged (five arrow
  cells for six columns), so it is checked against two independent sources below rather than one.
- **Evidence (public, source 1):** USGS National Field Manual, `eval/claims/usgs-nfm-a6.4-ph.json`,
  claim `ph-table642-acid-mine-01` — *"For acid-mine waters (low pH and elevated iron)..."*
  (Table 6.4–2) and `ph-extreme-low-01` — *"An extreme low field pH measurement of -3.6 has been
  reported for hyperacidic mine waters."* Confirms acid mine drainage as a real, low-pH,
  elevated-mineral-load water condition independent of the source-of-truth doc.
- **Evidence (public, source 2):** USGS National Field Manual, `eval/claims/usgs-nfm-a6.5-orp.json`,
  claim `orp-practical-limits-01` — *"The practicality of Eh measurements is limited to iron in
  acidic mine waters and sulfate in waters undergoing sulfate reduction"* — and
  `orp-gradients-01`, which lists *"mine-drainage discharges"* among the conditions Eh/ORP can
  delineate. Confirms the pH-conductivity pairing's association with acidic/mineral loading from
  a second, independently-authored USGS chapter.

### `disc-acid-esc-01` (escalation)

- **Water body:** Any
- **Min severity:** Moderate · **Min confidence:** 0.55
- **Draft text:** "This pH-and-conductivity pairing is consistent with an acidic input. Your state
  environmental agency is generally the right party to help evaluate a signature like this,
  especially if it's sustained."
- **CER referral:** "Clean Earth Rovers can provide the underlying readings on request."
- **Evidence:** same as `disc-acid-edu-01`, plus the EPA reporting-path source used for
  `disc-sewage-esc-01`.

---

## Rejected list

| id (working title) | event type | tier attempted | rule broken |
|---|---|---|---|
| sewage grab-sample | Sewage | diy-hints | Implicit safety exposure. "Collect a grab sample near the buoy" sounds procedural, but a sewage-consistent signature is exactly the condition where handling nearby water carries a real, unstated exposure risk. The device cannot say the water is safe to approach or touch, and staying silent on that while directing contact is worse than saying nothing — this is the spirit of "no health or safety claims," not the letter of it, and it should still fail review. |
| sewage swim-safety line | Sewage | education | **No health or safety claims.** Direct statement about swim safety ("water may not be safe for swimming") — exactly the claim the buoy cannot make; it has no pathogen sensor. |
| industrial named-plant | Industrial | education | **Never name or imply a culprit.** "Likely coming from the wastewater treatment plant near your location" names a specific facility type and location as the source. |
| industrial halt-use | Industrial | diy-hints | Reads as a safety directive disguised as an action ("temporarily halt any water intake used for irrigation") — implies the water is currently unsafe for that use, which is a safety claim by another name, and it is not a low-risk reversible action so much as an operational/economic one for whoever depends on that intake. |
| acidic-input neutralize | Acidic input | diy-hints | **Chemicals prohibited from diy-hints.** "Add agricultural lime or a buffering agent near the buoy" requires a chemical and is an uncontrolled in-water intervention — also likely a permit question in most jurisdictions. |
| acidic-input permit accusation | Acidic input | education | **Never name or imply a culprit** / no permit-violation assertions. "This means someone upstream is violating their discharge permit" is exactly the disallowed accusation the hard rules name directly. |
| stormwater silt sock | Stormwater | diy-hints | **In-water construction/installation prohibited from diy-hints.** Installing a silt sock or turbidity curtain at the intake is a physical in-water installation, plausibly permit-triggering, and not something to hand a chatbot user as a "quick fix." |
| stormwater next-storm prediction | Stormwater | education | **No prediction.** "Expect the next heavy rain to trigger another spike" forecasts a future event; the assistant may describe what was measured, not what will happen next. |
| stormwater shoreline check | Stormwater | diy-hints | Implicit safety issue: "visually confirm runoff near the shoreline" during or shortly after a storm event is exactly the condition (rising water, slick banks, possible flash flow) where suggesting an operator go stand near the water is a bad idea for a device that has no way to know local conditions. |

Nine rejections against nine approvals — this family really does run close to 1:1, which the
assignment predicted.

---

## Sourcing candidates

Not added to the corpus, not downloaded, no ingestion run — listed only as a note for whoever
scopes the next corpus wave.

- **EPA CADDIS "Urbanization" causal-pathway pages** (`epa.gov/caddis`), specifically the
  Wastewater Inputs and Impervious Surface pages. Free, public, HTML (so it is *not* a PDF —
  would need a fetch-and-convert step, not a drop-in ingest), current, and dense in exactly the
  parameter-to-stressor language this family needs (DO, conductivity, turbidity tied explicitly
  to wastewater and runoff causes). The strongest candidate of the three below, but its "current
  edition" status is really "continuously updated web page," which is a different ingestion
  shape than the corpus's existing PDF-only diet.
- **EPA Volunteer Stream Monitoring "Monitoring & Assessment" chapters** (the `archive.epa.gov`
  VMS series used twice above, sections 5.5 Turbidity and 5.9 Conductivity). Public, free, dense,
  written for exactly this non-specialist audience — but it's an EPA *archive* mirror, and an
  archived URL is a bad citation to depend on long-term; worth checking whether a live,
  non-archived EPA equivalent exists before treating it as ingestable.
- **A state environmental agency's illicit-discharge-detection field guide** (several states —
  e.g., a stormwater IDDE manual — publish these for exactly the DO/conductivity/turbidity/pH
  correlated-signature purpose the source-of-truth doc's matrix already covers). Not chosen
  specifically because I did not verify any one state's guide is current, free, and PDF-extractable
  without spending real time evaluating candidates — flagging the category, not a specific
  document.

---

## Honest read: can any of these four carry a diy-hints entry?

Barely, and only one clears it. Stormwater's `disc-storm-diy-01` (compare the timestamp to a
rainfall or tide record) works because it is not an action on the water, the site, or the device
at all — it is the operator looking at a record they may already have. That is what "low-risk
and reversible" reduces to once chemicals, permits, and in-water work are all off the table for a
signature that might mean someone's discharge, not the operator's fountain: there's nothing
physical left to suggest.

Sewage, Industrial, and Acidic input don't have an equivalent. Every physical or chemical action I
could construct for them (sample, treat, block, inspect up close) either touches water that might
carry an actual hazard the device cannot assess, or crosses into remediation the "generic,
non-prescriptive" and "no chemicals/permits/construction" rules were written to keep out. The
honest shape of this family is: education explains the pattern, escalation says who normally
handles it, and diy-hints is close to structurally empty — which the assignment's framing predicted
before I started drafting.
