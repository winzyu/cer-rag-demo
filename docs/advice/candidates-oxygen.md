# Candidate advice-catalogue entries — Hypoxia & Algal bloom

Owner scope: the `Hypoxia` and `Algal bloom` `EventType`s only (`src/report/types.ts`). Discharge
events (Sewage, Stormwater, Industrial, Acidic input), thermal/salinity (Thermal, Saltwater
intrusion), and instrument health are owned elsewhere and are not drafted here.

These are candidates for human review, not shipped copy. Background: `docs/RESPONSIBILITY.md`
("Decided 2026-09-09 — advice content comes from a prompt-carried allowlist" and the operator-
meeting reconciliation). Per that decision, the corpus itself does not change for this feature —
advice is grounded by being carried in the system prompt, not by new retrieval documents — so every
entry below is evidenced either by what's already in the corpus or by a public authoritative
source, never by new document sourcing.

## How the two detectors actually behave (read before rejecting or approving gates)

- **Hypoxia** (`classify()` in `src/report/events.ts`) fires on exactly one signature: dissolved
  oxygen down **and** ORP down, **with turbidity and conductivity both not-up**. That "not up" half
  is what distinguishes it from Sewage in the same function — a Hypoxia classification has, by
  construction, already ruled out the sewage-style signature. Confidence is a fixed `0.6` — there
  is no gradient, so a `minConfidence` gate on a Hypoxia entry is a safety margin against future
  code changes, not a real filter today. Severity is duration-derived (`Low` ≤3h, `Moderate` >3h,
  `High` >12h, capped at `Moderate` if the excursion is persistent/whole-period).
- **Algal bloom** (`detectAlgalBloom()`) is a separate code path that does **not** go through the
  confidence-floor downgrade every other event type gets in `eventForWindow` — an unconfirmed bloom
  (DO diel swing alone, confidence `0.45`) ships as type `"Algal bloom"` even though `0.45` is below
  `CONFIDENCE_FLOOR` (`0.5`). Confidence only reaches `0.6` when pH shows a matching in-phase swing.
  Severity is hardcoded `"Moderate"` always — never `Low` or `High` — so no candidate below can gate
  on severity `High` for this event type; it would simply never fire.

These two facts drove several of the `minConfidence` choices below and are why one candidate is
gated at the higher (`0.6`, pH-confirmed) tier rather than firing on every bloom flag.

## Summary

| id | event type | water body | tier | min severity | min confidence | referral |
|---|---|---|---|---|---|---|
| `hyp-edu-01` | Hypoxia | any | education | Low | 0.5 | — |
| `hyp-diy-01` | Hypoxia | any | diy-hints | Low | 0.5 | — |
| `hyp-esc-01` | Hypoxia | any | escalation | Moderate | 0.5 | — |
| `hyp-esc-02` | Hypoxia | Freshwater | escalation | Moderate | 0.5 | — |
| `bloom-edu-01` | Algal bloom | any | education | Moderate | 0.4 | — |
| `bloom-diy-01` | Algal bloom | any | diy-hints | Moderate | 0.4 | — |
| `bloom-esc-01` | Algal bloom | any | escalation | Moderate | 0.4 | — |
| `bloom-esc-02` | Algal bloom | any | escalation | Moderate | 0.6 | Clean Earth Rovers |

---

## `hyp-edu-01` — what a Hypoxia flag means

- **Event type:** Hypoxia
- **Water body:** any
- **Tier:** education
- **Min severity:** Low · **Min confidence:** 0.5 (Hypoxia's only produced value is 0.6, so this
  always fires when the type is Hypoxia)
- **Draft text:** "Dissolved oxygen and ORP fell together over this window, with conductivity and
  turbidity holding steady — a pattern consistent with oxygen being consumed faster than it's being
  replenished, rather than an external discharge. This describes the shape of the reading, not its
  cause."
- **Referral:** none
- **Evidence (corpus, preferred):**
  - `eval/claims/water-quality-metrics-source-of-truth.json`, claim `sot-sig-hypoxia-01`: "The
    primary signature of hypoxia or fish-kill conditions is DO and ORP both bottoming out together,
    with DO approaching zero and ORP going strongly negative."
  - Same file, claim `sot-do-orp-coupling-01`: "Dissolved oxygen and ORP are tightly coupled:
    abundant DO drives ORP strongly positive, ORP declines as DO is consumed, ORP goes negative once
    oxygen is exhausted, and ORP often moves before DO hits bottom, giving lead time."
  - The "conductivity and turbidity holding steady" clause is drawn directly from the detector's own
    trigger condition (`do_ === "down" && orp === "down" && turb !== "up" && cond !== "up"`), so the
    wording matches what the code actually checked rather than asserting something the classifier
    didn't verify.

## `hyp-diy-01` — clear organic debris near the site

- **Event type:** Hypoxia
- **Water body:** any
- **Tier:** diy-hints
- **Min severity:** Low · **Min confidence:** 0.5
- **Draft text:** "Decaying organic matter — leaves, grass clippings, algae mats — consumes oxygen
  as it breaks down. Clearing debris that's accumulated near the monitoring site is a simple,
  reversible step that removes one possible contributor, though it's unlikely to be the whole
  story."
- **Referral:** none
- **Evidence:**
  - Corpus, `sot-do-most-important-01`: "organic pollution consumes oxygen through biochemical
    oxygen demand."
  - EPA, [Hypoxia 101](https://www.epa.gov/ms-htf/hypoxia-101): "As dead algae decompose, oxygen is
    consumed in the process, resulting in low levels of oxygen in the water."
  - Why it clears the diy-hints bar: no chemical, no permit, no in-water construction — it's picking
    up debris at the water's edge, and it's reversible in the sense that there's no equipment or
    process left behind if it turns out to be unrelated.

## `hyp-esc-01` — sustained low oxygen, general escalation

- **Event type:** Hypoxia
- **Water body:** any
- **Tier:** escalation
- **Min severity:** Moderate (excludes brief <3h blips; fires on genuinely sustained excursions)
  · **Min confidence:** 0.5
- **Draft text:** "Dissolved oxygen has stayed below the normal range for more than a few hours,
  not just a brief dip. A water-quality professional or your local environmental agency can help
  investigate — a sustained reading like this is more likely to reflect a real site condition than
  sensor noise."
- **Referral:** none (deliberately not CER — see rejected list; CER doesn't diagnose site-specific
  water chemistry causes, and pointing there for a chemistry question overstates the referral)
- **Evidence:**
  - EPA, [Hypoxia 101](https://www.epa.gov/ms-htf/hypoxia-101): sustained low-DO areas become "dead
    zones ... unable to sustain normal populations of fish, shellfish, corals, and other aquatic
    life" — supports treating a sustained (not momentary) low-DO reading as worth a second look
    rather than routine variation.
  - The severity gate itself is corpus/code-grounded, not just asserted: `src/report/events.ts`
    only assigns `Moderate`/`High` once `durationHrs > 3`, so this entry only fires on windows the
    detector itself already treats as a step departure rather than noise.

## `hyp-esc-02` — freshwater aeration, name the professional

- **Event type:** Hypoxia
- **Water body:** **Freshwater only** — a small fountain/diffuser doesn't meaningfully aerate an
  open harbor or estuary; this mirrors the operator-meeting example verbatim
  (`docs/RESPONSIBILITY.md`: "Low dissolved oxygen in fresh water — a valid instruction would be to
  install a fountain. In a harbor that does not make sense.")
- **Tier:** escalation (**not** diy-hints — see rationale below)
- **Min severity:** Moderate · **Min confidence:** 0.5
- **Draft text:** "In fresh water, surface aeration is a common approach to raising dissolved
  oxygen — fountains and bottom diffusers are the usual options. Getting the timing and depth right
  affects whether aeration helps or briefly makes things worse, so this is worth planning with a
  pond or lake management professional rather than treating as a quick fix."
- **Referral:** none (generic contractor language, no vendor name)
- **Evidence:**
  - University of Florida IFAS Extension, SS695, *Stormwater Pond Management: What You Need to Know
    about Aeration* (ask.ifas.ufl.edu/publication/SS695): "common aeration systems include fountains
    (surface aerators) and bubblers (diffusers or bottom aerators)."
  - Same source, on why this is escalation and not diy-hints: "aerators should be installed and
    begin operation in the winter or early spring, when the water is cooler and ponds are generally
    not stratified" and "[d]issolved oxygen should be monitored closely during this initial period
    to ensure hypoxia is not accidentally induced." Installing aeration equipment at the wrong time
    can worsen the exact condition it's meant to fix — that is precisely why this stays escalation
    (name the professional) rather than diy-hints (a low-risk reversible action), even though the
    prompt's own acceptable-wording example ("fountains and aerators are the usual options") reads
    like it could go either way.

---

## `bloom-edu-01` — what an Algal-bloom flag means

- **Event type:** Algal bloom
- **Water body:** any
- **Tier:** education
- **Min severity:** Moderate (the only value `detectAlgalBloom` ever produces — gating on anything
  else would never fire)
- **Min confidence:** 0.4 (fires on both the unconfirmed 0.45 base case and the 0.6 pH-confirmed
  case; see detector notes above for why 0.45 needs an explicit sub-0.5 gate)
- **Draft text:** "Dissolved oxygen swung from a midday high to a pre-dawn low within the same
  24-hour period — a daily pattern the reference material describes as consistent with heavy algal
  activity, rather than the smaller day-to-day variation that's typical background. This describes
  the shape of the measured pattern; it doesn't identify a species or confirm a bloom is present."
- **Referral:** none
- **Evidence (corpus):**
  - `eval/claims/water-quality-metrics-source-of-truth.json`, claim `sot-sig-algal-01`: "The primary
    signature of an algal bloom or eutrophication is large in-phase daily DO and pH oscillations,
    with supersaturation midday and a crash pre-dawn, and the pre-dawn DO minimum is the danger
    window."
  - Same file, `sot-ph-do-coupling-01`: "In-phase daily swings of pH and DO are the fingerprint of
    biological productivity" — supports naming pH's confirming role without claiming pH always
    confirms (it doesn't, in the 0.45 case).
  - Wording check against the hard rule: "movements consistent with heavy algal activity," never
    "you have/will have a bloom," and explicitly disclaims species/confirmation — matches the
    `docs/RESPONSIBILITY.md` instruction that the assistant must decline overclaiming "without
    contradicting the vendor or telling the customer they are wrong."

## `bloom-diy-01` — reduce nutrient inputs you control

- **Event type:** Algal bloom
- **Water body:** any
- **Tier:** diy-hints
- **Min severity:** Moderate · **Min confidence:** 0.4
- **Draft text:** "Algae growth is fed by nutrients — fertilizer runoff, grass clippings, and leaf
  litter reaching the water are common sources. Timing fertilizer application away from the
  shoreline and keeping yard waste out of the water are simple, reversible steps that reduce one
  contributor, without addressing whatever else may be driving the pattern."
- **Referral:** none
- **Evidence:**
  - EPA, [What You Can Do: In Your Yard](https://www.epa.gov/nutrientpollution/what-you-can-do-your-yard):
    "Apply fertilizers only when necessary and at the recommended amount... avoid applying fertilizer
    close to waterways," and "[u]se yard waste, which includes grass clippings and leaves, in mulch
    or compost for your garden... which keeps them from washing into streams."
  - Why diy-hints holds here: no chemical is added, no permit is implicated, nothing is built in the
    water — it's reducing/timing an input the operator already controls, and stopping is as easy as
    starting.

## `bloom-esc-01` — a lab test is the only real confirmation

- **Event type:** Algal bloom
- **Water body:** any
- **Tier:** escalation
- **Min severity:** Moderate · **Min confidence:** 0.4
- **Draft text:** "This pod's sensors can't identify algae species or detect toxins. If knowing for
  certain matters, your state environmental or health agency can test a water sample directly — that's
  the only way to confirm whether a bloom is present and whether it's producing toxins."
- **Referral:** none (points at the agency, not CER — CER's product has no toxin/species sensor
  either, so referring there for confirmation would repeat the same overclaim the corpus brief
  flags in the vendor's own marketing)
- **Evidence:**
  - EPA, [What to Do If You Suspect a Harmful Algal Bloom](https://www.epa.gov/habs/what-you-can-do):
    "State departments of health or environment can test waterbodies to determine if an algal bloom
    is toxic."
  - Directly supports the "sensors can't tell you this" framing required by the hard rule that "the
    six parameters cannot confirm a bloom or identify a species."

## `bloom-esc-02` — Clean Earth Rovers referral, pH-confirmed only

- **Event type:** Algal bloom
- **Water body:** any
- **Tier:** escalation
- **Min severity:** Moderate · **Min confidence:** **0.6** — deliberately the higher gate, so this
  fires only on the pH-confirmed case, not the bare DO-swing-alone 0.45 case. This is the specific
  entry the operator-meeting reconciliation asked for ("refer the operator to Clean Earth Rovers"),
  and reserving the referral for the stronger signal keeps the weakest detections from triggering a
  vendor contact.
- **Draft text:** "This kind of recurring swing is worth a closer look. Clean Earth Rovers support
  can help interpret patterns like this one and talk through additional monitoring options."
- **Referral:** Clean Earth Rovers support (monitoring/interpretation only)
- **Evidence:**
  - `docs/RESPONSIBILITY.md`, "Adopted, reworded — the referral": "The referral is worth building.
    The prediction is not, and must not ship in that form... What survives: an allowlist entry fired
    by a measured event signature the report pipeline already detects, worded as conditions
    consistent with a concern, paired with the referral line."
  - Scope check: the draft text does **not** say "cleanup" — nothing in the corpus or CER's own
    documented product scope (a monitoring buoy, per `docs/CORPUS_SOURCING_BRIEF.md` §1–2) supports
    that CER performs in-water remediation. "Interpret patterns... monitoring options" is what the
    evidence actually supports CER doing.

---

## Rejected

Kept because the rule that killed each one is exactly the kind of thing a reviewer needs to see was
considered and not just missed.

1. **"Install a fountain/aerator yourself"** as a **diy-hints** entry (Hypoxia, Freshwater).
   Broke: *nothing requiring... in-water construction may be diy-hints* — and, more concretely, the
   UF IFAS source shows wrong-timing installation can **induce** hypoxia rather than relieve it,
   which fails "low-risk" on its own terms even before the construction question. Survives instead
   as `hyp-esc-02` (escalation, name the professional).

2. **"You're going to have an algal bloom — call Clean Earth Rovers for cleanup."**
   Broke: the no-prediction rule ("movements consistent with...", never "you will have a bloom") and
   overstated CER's product scope — nothing evidences CER performs bloom cleanup; it sells a
   monitoring buoy. This is the exact case `docs/RESPONSIBILITY.md` calls out by name as "the least
   defensible claim available." Reworded and survives as `bloom-esc-02`.

3. **"Add an algaecide / hydrogen peroxide treatment to clear the bloom."**
   Broke: diy-hints chemical prohibition outright, and edges toward a health/safety claim by
   implying treatment makes the water fine again.

4. **"Swimming isn't recommended right now"** / any variant naming swim, drink, or fish safety
   during a Hypoxia or Algal-bloom flag.
   Broke: the flat no-health/safety-claims rule — the buoy has no sensor that bears on any of those
   questions, for either event type.

5. **"This is a toxic bloom of [X species]"** or any species/toxin-specific phrasing.
   Broke: *nothing the six parameters cannot support* — no sensor here measures toxins or
   distinguishes algae taxa. `sot-sig-algal-01` supports a DO/pH pattern claim, nothing about species
   or toxicity.

6. **"Check with the harbor master about a possible sewage discharge"** attached to a Hypoxia flag.
   Broke: contradicts the detector's own logic — `classify()` only reaches "Hypoxia" when turbidity
   and conductivity are specifically *not* up, which is the same test that rules out the Sewage
   signature in the same function. Recommending a sewage follow-up on a Hypoxia-classified event
   argues against what the code already checked. Also crosses into the Sewage-event owner's scope.

7. **"Relocate the pod"** / **"clean the DO probe — it may be fouled"** attached to Hypoxia.
   Broke: scope, not a wording rule — biofouling and instrument placement are the instrument-health
   agent's event types, not Hypoxia or Algal bloom. A plausible suggestion, but not this catalogue's
   to make.

8. **"Reduce boat idling/wake in the marina to improve oxygen levels"** (Hypoxia, any water body).
   Broke: no evidence rule — nothing found in the corpus or in public sourcing ties vessel idling to
   measurable DO change at the scale a single buoy would detect; this would have been asserted, not
   evidenced, so it was dropped rather than shipped as a guess.

9. **A generic "normal ranges" restatement** ("DO below 5 mg/L is Low per the operator thresholds")
   as its own Hypoxia education entry.
   Broke: not really a rule violation so much as redundant — the parameter table in Section 2 of the
   report already states the operator-threshold flag and source per row (`src/report/types.ts`,
   `ParameterBaseline.baselineSource`/`baselineNote`); a duplicate allowlist entry saying the same
   thing adds a second, differently-worded copy of a number the report already prints once,
   authoritatively.

---

## Sourcing candidates

Per the assignment: not downloaded, not added to `documents/`, no ingestion run. Flagged only
because the corpus decision this feature runs on
(`docs/RESPONSIBILITY.md`, "Decided 2026-09-09") is explicit that **the corpus does not change for
advice content** — a new remediation-type document (e.g., the UF IFAS aeration-installation guide
used as evidence for `hyp-esc-02` above) is exactly the category `docs/RESPONSIBILITY.md` already
considered and rejected ("A new corpus tier of remediation documents... a sourcing project of
months... `CORPUS_SOURCING_BRIEF.md` has no remediation material queued"). So nothing "how to fix
it" is being flagged here, on purpose.

One candidate did surface that fits the corpus's *actual* stated gap rather than a remediation gap:

- **Florida DEP, "Derivation of Dissolved Oxygen Criteria to Protect Aquatic Life"**
  (`https://floridadep.gov/sites/default/files/tsd-do-criteria-aquatic-life.pdf`) — a state-agency
  technical derivation document with numeric DO criteria by exposure duration (acute/chronic) and
  water-body type, which matches `docs/CORPUS_SOURCING_BRIEF.md` §5 Priority 2 item 6 almost exactly
  ("Hypoxia — onset thresholds, duration, ecological consequence, in estuarine and freshwater
  settings") — method/threshold content, not remediation.
  **Caveat, and it's a real one:** `WebFetch` could not extract readable text from this PDF (came
  back as FlateDecode-compressed binary rather than clean text), so I could not confirm it clears
  the corpus's own text-extraction gate. `docs/CORPUS_SOURCING_BRIEF.md` §7 says exactly this
  failure mode is common and to check with `pdftotext file.pdf -` before trusting a source — that
  check needs to be run properly (I did not run ingestion or ad-hoc scripts against it, per the
  house rules for this task) before this goes any further. Flagging the URL and the gap it would
  fill; not vouching for its extractability.
