# Legal Liability Mitigation — Options and Effort

Six options were raised for reducing legal exposure from chatbot answers. This records what
already exists in the codebase for each, what's missing, and a rough dev-time estimate for
closing the gap. Estimates assume one developer, working in this codebase's existing patterns.

## 1. Confidence-calibrated language in answers

**Exists today** (`src/prompt/systemPrompt.ts`): the model already refuses outright when context
doesn't support an answer (`REFUSAL_SENTENCE`), and is told never to fill gaps from general
knowledge or fabricate readings/citations. This is binary — refuse or answer — not graduated
hedging on a borderline-but-not-empty retrieval.

**Missing:** a middle state — "the context partially supports this, treated as uncertain" —
distinct from a clean answer or an outright refusal.

**Effort: 0.5–1 day** for the prompt wording itself, **but** `buildSystemPrompt()` is a pinned
control for the active retrieval bake-off (`RETRIEVAL_BAKEOFF.md` §4, hash-pinned in
`test/unit/prompt.test.ts`) — changing it voids the three captured arms and requires re-running
the sweep. Best sequenced after ◆G7 closes; done now, add ~1 day of eval rework.

## 2. Source citation in-product

**Already built, end to end.** The API returns `citations` (the retrieved chunks) alongside every
answer (`ChatController.ts`), the prompt instructs the model to cite its source
(`systemPrompt.ts`), and the frontend renders a deduplicated citation list under each answer
(`frontend/js/render.js: renderCitations`, `frontend/js/provenance.js`). Nothing to build for the
baseline version of this option.

**Optional enhancement:** citations currently show the source *file*, not a page number or exact
quote. Chunks don't carry page metadata (`src/ingestion/chunk.ts`), so "per EPA factsheet X, p.4"
would need that added at ingestion time. **Effort: 0.5–1 day** if wanted; skippable otherwise.

## 3. Escalation paths for high-stakes answers

**Partially exists:** the prompt already refuses drink/swim safety questions and tells the user to
consult local public-health authorities (`systemPrompt.ts`). Out-of-range readings are detected
(`src/report/events.ts`, `src/devices/plausibility.ts`) but the report narrative and chat answers
don't currently append a "consult a professional" line for those cases.

**Effort: 0.5–1 day** — a prompt rule for out-of-range chat answers (~1 hr), plus a template
addition in `src/report/narrative.ts` for excursions the report already detects (~half a day).

## 4. Human-in-the-loop review for high-stakes answers

**Does not exist.** The pipeline is fully autonomous end to end — no hold-back, queue, or approval
step anywhere between the LLM call and the response reaching the user.

**Effort: 1–2 weeks for an MVP** — this is the largest item, a new feature rather than a tweak:
- Classify which answers qualify (regulatory-compliance or animal-welfare-adjacent topics).
- Hold the answer instead of returning it immediately; persist it as pending.
- A minimal approve/edit/reject surface for a human reviewer (no polish needed for v1).
- A way to deliver the reviewed answer back to the requester (poll, webhook, or email).

A rougher manual version (e.g., a human spot-checks a daily log rather than gating every
high-stakes answer before delivery) is much cheaper — closer to **1–2 days** — but is after-the-fact
review, not pre-delivery gating, which is a materially weaker liability position.

## 5. Insurance and contractual terms

**Not a development task for the substance** — E&O/product liability insurance and ToS drafting
are legal/business work, not code. The one engineering piece is surfacing the terms in-product.

**Effort: 0.25–0.5 day** for a disclaimer banner or first-use modal ("advisory, not prescriptive")
gated behind an acknowledgment stored client-side. The legal text itself needs a lawyer, not a
dev-time estimate.

## 6. Logging and audit trails

**Does not exist.** Logging today is `morgan` request logs plus a tagged console logger
(`src/utils/logger.ts`, `docs/SPECS.md` §8) — ephemeral, not queryable, and not tied to what was
retrieved or why. The `citations` returned to the caller are never persisted server-side.

**Effort: 1–2 days** for the basic version: write one record per chat response (query, retrieved
chunks/sources, final answer, model, mode, caller identity, timestamp) to Firestore, reusing the
existing lazy client (`src/config/database.ts`) the same way `FirestoreCorpusSource` already does.
**+0.5–1 day** for a simple lookup/export path so a record can actually be pulled if a claim is
litigated — without one, the data exists but isn't retrievable under time pressure.

## Summary

| # | Option | State | Est. effort |
|---|---|---|---|
| 1 | Confidence-calibrated language | partial (binary refuse/answer) | 0.5–1 day + bake-off rework |
| 2 | Source citation in-product | **done** | 0 (0.5–1 day optional) |
| 3 | Escalation paths | partial | 0.5–1 day |
| 4 | Human-in-the-loop review | none | 1–2 weeks (MVP); 1–2 days (after-the-fact only) |
| 5 | Insurance / ToS | none (dev slice only) | 0.25–0.5 day (dev slice); legal work not estimated |
| 6 | Logging and audit trails | none | 1.5–3 days |

**Everything except #4 totals roughly 3–6 developer-days.** Item 4 dominates the schedule — a
real pre-delivery review gate is a new feature, not a hardening pass on what's already built. A
lighter after-the-fact review (spot-check a log rather than gate delivery) is far cheaper but is a
materially weaker position if the point is to catch a bad answer before it reaches someone.

## Phased rollout

A four-phase plan was proposed, gating specificity/confidence to how much is at stake if the bot
is wrong, rather than to what the model happens to know. Directionally sound, and it composes
cleanly with the options above. Qualified against what's actually in the codebase:

**Phase 1 — Education only, no reference to the user's own sensor data.**
Closer to already-built than it looks: `SENSOR_TOOL` (default **off**, `src/config/index.ts`)
already means the model has no access to this deployment's live readings at all — it can only
answer from document CONTEXT and the `REFUSAL_SENTENCE`. The gap to a clean Phase 1 is narrower
than a new feature: mainly making sure the "is this reading normal" framing in the system prompt
(the AUTHORITATIVE NORMAL RANGES block) doesn't leak in while the flag is off, since that block is
written assuming a reading exists to judge. **Effort: under a day** — mostly prompt-scoping and a
fixture or two, not new infrastructure.

**Phase 2 — Diagnosis + escalation, no DIY fixes.**
This is options 1 and 3 above, combined, plus one explicit new constraint: the current prompt has
no rule against suggesting a fix once it identifies an out-of-range reading — it just isn't asked
to. "No DIY fix recommendations" needs to be a stated prohibition, not an absence of instruction,
or the model will fill the gap the first time a user asks "so what do I do about it." **Effort:
folds into options 1 + 3's 1–2 days**, plus explicit no-fix wording and a support-contact line.

**Phase 3 — Low-stakes, reversible DIY suggestions.**
The plan's own framing ("hard to mess up, low consequence if wrong") is the right test, but a
free-text LLM answer is a bad way to enforce it — asking the model to self-limit to "genuinely
low-risk" suggestions through prompt wording alone is exactly the kind of instruction that erodes
under paraphrase and follow-up questions. **This phase needs a curated, fixed list of pre-approved
suggestions the model may select from (tied to specific trigger conditions), not open generation
hedged by instruction.** That's a real, scoped feature: an allowlist keyed to event types the
report pipeline already detects (`src/report/events.ts`), plus prompt rules that route to it
instead of free generation. **Effort: 2–4 days** — most of it is enumerating and wording the
allowlist carefully, not the plumbing.

**Phase 4 — Broader prescriptive advice.**
Correctly gated on insurance, legal sign-off, and accuracy benchmarking, all outside dev time. One
thing worth noting: this repo already has the benchmarking infrastructure that phase would need —
`eval/`, `src/eval/gates/`, `GRADING_GUIDE.md` — so "some human-reviewed accuracy benchmarking"
isn't a new system to build, it's running the existing eval apparatus against a Phase 4 prompt and
having a human grade the packet before sign-off. **Effort: not a dev estimate** (gated on
non-engineering approvals) beyond re-running the existing eval harness once those approvals exist.

## Decided 2026-09-09 — advice content comes from a prompt-carried allowlist

The product goal widened to answering with broad solutions. Three ways to supply that content were
considered and the allowlist wins on a technical argument, not a preference.

**Grounding is defined as the union of the retrieval context, the system prompt, the user's
question and any tool results** — which is why the operator normal ranges are quotable today
without being scored as fabricated. So an approved-suggestion list carried *in the system prompt*
is grounded by construction, and the pre-registered ≤2% ungrounded-turn ceiling survives untouched.

The two rejected alternatives:

- **Advice from the model's own knowledge.** Ungrounded by definition. The ceiling is ≤2% of turns,
  about one turn in 92, so any real advice tier fails it immediately. Shipping this means moving a
  pre-registered threshold, which is the failure the eval rebuild exists to prevent.
- **A new corpus tier of remediation documents.** Grounded, but a sourcing project of months. The
  corpus is measurement method and instrument specification only; no document in it says what to do
  about a reading. `CORPUS_SOURCING_BRIEF.md` has no remediation material queued.

**Consequence: the corpus does not change for this.** No sourcing, no re-ingest, no re-chunk, and
every retrieval label stays valid.

**What the allowlist still needs, and it is not engineering:** the suggestions themselves, each tied
to a trigger condition the report pipeline already detects (`src/report/events.ts`), authored by the
operator. The `prescriptive` tier stays gated on legal sign-off per §5 above.

**Structural recommendation:** implement the phase as an explicit config flag (e.g.
`ADVICE_TIER=education|escalation|diy-hints|prescriptive`), following the pattern `SENSOR_TOOL` and
`REPORT_TOOL` already establish in this codebase — a flag that changes the system prompt and is
pinned/tested per state, rather than a soft distinction left to prompt wording alone. That gives
every phase transition the same guarantee this repo already relies on for its retrieval bake-off:
a byte-identical, hash-pinned prompt per state, so "which phase was this answer generated under" is
never ambiguous after the fact.
