# Clean Earth RAG — Implementation Timeline

A phased plan for building the Clean Earth RAG assistant on the **Node/Express + Firestore** stack.
Durations are relative sizing, not calendar promises. **Decision gates (◆)** must be resolved before
the work downstream of them starts.

This is the successor to the original migration timeline. The single biggest change: the target-stack
gate (◆G1) is now **resolved** — see below — which re-anchors every phase that depended on it.

> **Current state and how to resume: [`HANDOFF_2026-08-27.md`](HANDOFF_2026-08-27.md).** The N2 sweep is
> captured and valid; what remains is grading. Read that first if you are picking this up cold.

Companion docs: [`SPECS.md`](SPECS.md) (what's built today), [`migration/CONVENTIONS.md`](migration/CONVENTIONS.md)
(coding conventions), [`migration/MIGRATION_SPEC.md`](migration/MIGRATION_SPEC.md) (legacy FastAPI
behavior being ported), [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) (the Phase N2 direct-feed vs
RAG experiment design), [`EVAL_FIXTURES.md`](EVAL_FIXTURES.md) (the committed bake-off question set),
[`CHAT_UX_WORKPLAN.md`](CHAT_UX_WORKPLAN.md) (N5's startable work, cut into parallel workstreams),
`report/…report-template.pdf` (the report template a later phase builds toward).

> The previous planning docs `BACKLOG.md` and `data-access-findings.md` were retired during the
> stack conversion. Their still-relevant items are folded into the phases below; the legacy system's
> behavior is preserved in `MIGRATION_SPEC.md`.

---

## Where we are now

**◆ G1 — Target stack & data store: RESOLVED → Option C (full migration to Node/Express + Firestore).**

The original timeline held three options: (A) run the FastAPI/pgvector demo as-is, (B) hybrid — keep
the Python RAG core, swap only the sensor source, (C) full port to Node/Express + Firestore. **C was
chosen and is underway.** This closes the largest gate and unblocks the phases below; it also means
retrieval must be re-implemented off pgvector (new gate ◆G7).

**New track: the retrieval strategy is now an experiment, not an assumption — and the driver is
cost.** The two strategies have structurally different cost shapes (direct-feed: large flat
per-request input, zero fixed cost; RAG: small per-request input, but corpus embedding + index
storage + re-embedding on every corpus change), and which is cheaper at our query volume can't be
reasoned out — it has to be measured. So Phase N2 measures a **direct-feeding brain** (put the source
text in the prompt) against a **RAG brain** (embed → search → inject top matches), prices both, and
lets the numbers close ◆G7. Full design in [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md).

Two things to keep straight about this track:

- It deliberately restored a **dev-only** pgvector sidecar as the legacy-parity baseline — a measuring
  stick, not a reversal of ◆G1. It never entered the deployed path.
  **Executed as archival on 2026-08-19** — the *evidence* (transcripts, scores, the `pgvector-rag`
  cost scenario) is what makes ◆G7 auditable later and stays; the *runtime code* (adapter, seeder,
  schema, compose file, the `pg` dependency) is what costs upkeep and went, to
  `archive/pgvector-rag/` at its original paths.
  **This happened ahead of ◆G7 by decision, not because ◆G7 closed** — the gate is still open on
  grading and on `RETRIEVAL_COMPARISON.md` (see ◆G7 below). It was safe to do early *because* of the
  split above: grading, `npm run cost` and `npm run grade:packet` all read captured evidence, none of
  them the arm's code. The price paid is that the arm **cannot be re-run or re-captured** without
  restoring it from the archive — so if grading ever demands a fresh `pgvector-rag` capture, that
  restore is the first step, and any re-capture must re-run every arm (the prompt is a pinned
  control).
- **It is built and swept.** All three arms are implemented, seeded and captured cold + warm on
  `feat/bakeoff-sweep`. What remains is a re-capture on the current corpus, then the gate passes —
  see ◆G7 below and [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §8b.

### Corpus scoped to what the DataPod measures (2026-07-29)

The sensor reads six parameters: temperature, DO, ORP, conductivity, pH, turbidity. Six documents
covering analytes it **cannot** detect were moved to `documents/_excluded/` — EPA aquatic-life
criteria (metals/pesticides, and structurally shredded by its own table markup), recreational water
criteria (pathogens), nutrient criteria (N/P), plus two superseded DO references. Two of those were
worse than useless: the system prompt already refuses pathogen and non-measured-pollutant questions,
so retrieving them can only pull an answer toward material the bot must decline.

Added in their place, from the operator: `water-quality-metrics-source-of-truth.pdf` (all six
parameters, per-water-type baseline ranges, a pollution-event signature matrix, and sensor
data-quality caveats) and four Atlas Scientific probe datasheets (EC, ORP, pH, DO). These close the
turbidity-unit question, give **ORP its only coverage** in the corpus, and supply the grounding N6's
faulty-data/recalibration feature needed.

Corpus: 9 documents / ~340K tokens → **8 documents / ~179K tokens**. Still far larger than any
context window, so the N2 comparison remains meaningful — had it fit, direct-feed would win by
default and RAG would be moot.

> Those are the 2026-07-29 figures and are kept because they are what the N2 sweep ran against.
> The corpus was expanded on 2026-08-21 to 18 documents / ~1.25M chars / 558 chunks, then
> **trimmed on 2026-08-24 to 15 documents / 851,891 chars / 393 chunks** — three documents were cut
> after each was scanned for numeric criteria on the six parameters and all three returned zero.
> Current numbers in "Cross-cutting: data requirements" §4 and
> [`../documents/README.md`](../documents/README.md).

### Completed (migration groundwork)

- **Conventions reverse-engineered** from the sibling repos (`clean-earth-rovers-server`,
  `user-dashboard`) and reconciled into a single canonical [`CONVENTIONS.md`](migration/CONVENTIONS.md),
  with every cross-repo disagreement flagged and a recommendation given.
- **Legacy behavior captured** in [`MIGRATION_SPEC.md`](migration/MIGRATION_SPEC.md) so no logic is
  lost when the Python source is removed.
- **Service skeleton scaffolded** (see [`SPECS.md`](SPECS.md)): TypeScript + Express + Firestore
  bootstrap, centralized config loading/validation, memoized Firestore client, central error handling,
  tagged logging, `/health`, and an integration test. **Boots cleanly and passes the health check.**
- **Repo converted:** FastAPI/Postgres source, the Postgres `docker-compose`, and stale planning docs
  removed; README rewritten as a runbook.

---

## Confirmed decisions (carried forward, still in force)

- **Data:** the **live device API**, all six metrics (DO, ORP, pH, conductivity, temperature,
  turbidity), since ◆G8 resolved and N3 landed. The synthetic 766-row CSV this line used to describe
  is retired — it was never ported to Firestore and nothing reads it.
  *0 is a valid reading for turbidity and ORP — never flag 0 as erroneous for those.*
- **Sensor access:** **backend-mediated tool call** — `query_sensor_data` fetches data (user token
  forwarded), so the LLM queries on demand.
- **LLM:** Fireworks (OpenAI-compatible), model id **from config, never inlined** (serverless catalogue
  rotates). Current default `accounts/fireworks/models/gpt-oss-20b`; embeddings
  `nomic-ai/nomic-embed-text-v1.5` (768-dim).
- **Deployment:** local/demo for now; **Cloud Run** is the promotion target (per conventions §13).
- **Report:** template-based, six fixed sections, no visualizations in v1. **Compute vs. narrate** —
  every number/flag/status is computed deterministically in code; the LLM only narrates pre-computed
  facts.

---

## Phase N1 — Retrieval interface + chat spine (stub-backed) `✅ COMPLETE`
*Goal: a working `POST /chat` end to end on the new stack, before any real retrieval exists. Defines
the seam everything downstream plugs into.*

- **Define the retrieval interface first.** `Chunk = { id, text, source, score? }`;
  `getContext(query, opts?) => Promise<Chunk[]>`.
- **Adapter registry** mapping a mode name → implementation; selected via `config.DEFAULT_RETRIEVAL`.
- **Stub adapter** returning fixed fake chunks, so the whole chat path is testable with zero
  infrastructure.
- **`POST /chat`** — accepts `{ query, retrieval? }`. Selects the adapter from `config.DEFAULT_RETRIEVAL`;
  the request's `retrieval` override is honored **only when `config.DEBUG_RETRIEVAL` is true**, else ignored.
- **Prompt assembly** — static content first (system instructions, then document context), dynamic
  content (the user question) last. This ordering is required for Fireworks prompt caching — do not
  interleave.
- **Fireworks call** — OpenAI-compatible SDK at `https://api.fireworks.ai/inference/v1`; model id from
  config; set the `user` field per request for serverless cache affinity; `max_tokens` generous
  (gpt-oss emits reasoning tokens before visible output and truncates to empty if starved).
- **Streaming response.**

*Exit: **met.** The service answers `POST /api/v1/chat` end to end against the stub adapter, with
adapter selection and the debug-override rule enforced, in both JSON and SSE. 65 tests, none of which
touch the network. Verified live against Fireworks — including the ported refusal behavior. See
[`SPECS.md`](SPECS.md) §10.*

> **Delivered in five checkpoints** (C1–C5, the working shorthand for testable slices within a phase):
> C1 retrieval interface + registry + stub adapter · C2 `POST /api/v1/chat` · C3 system prompt +
> static-first assembly · C4 Fireworks call · C5 SSE streaming.

> The registry + `DEBUG_RETRIEVAL` override are also the **bake-off harness**: N2 compares strategies
> by swapping one request field on the same running server. Build the seam cleanly here and N2 costs
> no rework.

**Retrieval runs up front, not as a tool — and `search_documents` is gone.** The legacy service
exposed retrieval as a tool and let the model decide whether and when to search
(`MIGRATION_SPEC.md` §3–4.3). Here retrieval runs before the LLM call and the text arrives as
context. Two reasons:

- **It is what makes N2 measurable.** If the model chose when to retrieve, each arm would get a
  different number of retrievals per question depending on how the model behaved that run — you would
  be measuring tool-calling behavior, not the retrieval strategy.
- **Direct-feed has no tool-shaped equivalent.** "Put the corpus in the prompt" cannot be expressed
  as a function the model calls.

The cost is real and is **not** a free win: the model gets one shot at the query as asked and cannot
search, read, then search again the way the legacy loop could. Multi-part questions are the likely
casualty. That trade-off is ◆G11.

---

## Phase N2 — Retrieval bake-off: direct-feed vs RAG
*Goal: replace the stub with real document context — and decide **how** by measuring **what each
method costs**, not by arguing. Full experiment design:
[`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md).*

> **2026-08-26 — ◆G7 is split, and the retrieval half is decided.** Both gate tiers ran to
> completion. **Every arm failed the §8a quality floor** — best correctness 1.08/2 against a 1.30
> floor, best groundedness 53.4% of turns carrying an unsupported claim against a 2% ceiling — and
> §8a pre-committed to what happens then: record it, fix the system, re-run, and **do not move the
> floor.** The floor has not moved.
>
> The problem that forced a decision is that §8a's remedy was unreachable from inside §8a. Fixing a
> systemic quality defect means changing the system prompt; the system prompt is a pinned control
> until ◆G7 closes; ◆G7 cannot close while the floor is unmet. The gate blocked its own remedy.
>
> **Decision: split ◆G7.** The reasoning, and why it is not a loophole:
>
> - **The quality failures do not discriminate between arms.** Correctness spans 0.86–1.08 across
>   the three survivors and groundedness 53.4–58.6%; the *spread* between arms is far smaller than
>   the *distance* from either bar. A failure common to every arm is not evidence about retrieval
>   strategy, and ◆G7 asks which retrieval strategy ships.
> - **That question does have an answer in this data.** `firestore-direct` — a fixed 5-document
>   slice, no ranking, no vector search — wins correctness outright and takes 8 of 11 classes, at
>   cost within $26/year of the best hybrid at 10k requests/month. Retrieval sophistication ran
>   *opposite* to answer quality.
> - **So the retrieval half closes on the evidence, and the floor is re-filed where it belongs** —
>   as a **system-level deploy blocker**, carrying §8a's thresholds forward verbatim onto whatever
>   prompt and model configuration follows. Nothing ships below it. What changes is which gate owns
>   it, not what it demands.
>
> **The price of the split, accepted knowingly:** the arm comparison is now dated evidence. The
> prompt is unpinned, and the first thing that will happen is a prompt change to attack
> groundedness — which invalidates every captured arm. A passing groundedness number on a changed
> prompt does **not** retroactively confirm `firestore-direct`; that has to be re-earned by
> re-capturing. The alternative was to spend the remaining time protecting a comparison the data
> had already made while the defect that actually blocks shipping went untouched.
>
> Recorded in [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §8c and
> [`RETRIEVAL_COMPARISON.md`](RETRIEVAL_COMPARISON.md) §7.1a. **Two N5/N-series items unblock
> immediately:** system-prompt personality, and ◆G11's `search_documents`-as-a-tool question.
>
> **Two caveats to carry forward, both about the grading instrument rather than the result.**
> First, the judge's *count* dimensions do not reproduce — re-judging at temperature 0 moved 11 of
> 36 groundedness verdicts — while correctness is deterministic (36/36 and 30/30 across repeated
> runs). So no argument may rest on per-arm *differences* in the groundedness column; the gross
> conclusions survive, since a judge that noisy still cannot turn 53% into 2%.
>
> Second, and more actionable: **the human grading sample is stale for `firestore-vector`.** That
> arm was re-captured 2026-08-26 after the human graded it, so 12 of 36 human rows describe answers
> that no longer exist, and `--calibrate` cannot detect it. Scored over all 36 rows the refusal fix
> looks like a regression (kappa 0.87 → 0.83); scored over the 24 valid rows it is a clear
> improvement (0.81 → **0.94**). **The join was made self-checking on 2026-08-27**:
> `--calibrate` compares the packet's answer to the transcript and excludes rows the arm has
> outgrown. Doing so raised every dimension — correctness 0.83 → 0.87, ungrounded 0.33 → 0.57,
> citations 0.17 → 0.44 — so the judge was always better than the report claimed. What is left is
> data: `firestore-vector` contributes no human rows until it is re-graded
> (`RETRIEVAL_COMPARISON.md` §6.4a).
>
> **Status 2026-08-17, revised 2026-08-25 — built and swept, blocked on re-capture then grading.**
> All three arms are implemented,
> seeded and captured (168 transcripts, cold + warm, 28 of 30 fixtures, zero failed turns). Fireworks
> pricing was recorded 2026-08-03 and the cost model runs on measured sweep means (`npm run cost`).
> The one input still owed from outside the code is **projected requests/month**, without which the
> break-even curve has no operating point to read off.
>
> **What remains, revised 2026-08-25: re-capture, then machine-checked gates, then judgement.**
> It was "grading, not building"; it is now partly building again, because the evidence went stale.
> [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §8b is the amendment and carries the detail. In
> short:
>
> - **Most of the captured packet no longer grades the live system.** `firestore-direct`'s
>   transcripts survive — its ◆G9 slice is unchanged at 37,660 chars — but `firestore-vector`'s
>   were captured retrieving over 305 chunks of an 8-document corpus that is gone, `pgvector-rag`
>   is archived, and the four arms added 2026-08-24/25 have never been swept at all. **The 30
>   fixtures themselves are fine**: every filename they name still resolves.
> - **Three of §8a's five gates are mechanically decidable** — fabricated figures, refusal
>   integrity, citation validity — and those are exactly the three §8a makes *absolute*. They run
>   first and eliminate.
> - **The two judgement gates stay in the floor unchanged**, satisfied by the LLM judge §7b already
>   specifies, run only on Tier-1 survivors.
> - `eval/grading/warm/scores.csv` holds 36 of 174 rows from the 6-fixture calibration sample.
>   Those rows are kept as the human sample the judge calibrates against, not as the pass itself.
>
> **No threshold moved.** What changed is the order, the instrument, and which evidence counts.
>
> **2026-08-24/25 — retrieval is now measurable offline, and ◆G7 is no closer.** An
> LLM-free harness (`npm run retrieval:eval`, [`RETRIEVAL_EVAL.md`](RETRIEVAL_EVAL.md)) scores
> adapters against 99 labelled queries / 259 chunk-level labels in about ten seconds, and four new
> arms were built on it — `local-vector`, `local-hybrid`, `hybrid-slice-vector`,
> `hybrid-slice-lexvec`. Best recall moved 74.9% → **81.8%**, best MRR 0.551 → **0.623**.
> **None of that touches this gate.** Every pre-registered target in
> [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §8a is *answer* quality — fabricated figures,
> refusal integrity, citation validity, per-class correctness — and recall/MRR/nDCG appear in none
> of them. They are diagnostics. Grading is still the only thing that closes ◆G7, and it is still
> at 36 of 174 rows. Read §3's 20.2% floor before quoting any recall number: the `stub` adapter
> scores 20.2% while retrieving nothing at all.
>
> **2026-08-19: `pgvector-rag`'s runtime code archived** to `archive/pgvector-rag/`, ahead of ◆G7
> and by decision — the gate did **not** close. Nothing grading needs was touched: the 56
> transcripts, `eval/grading/warm/KEY.json`, the arm's cost scenario and its row in
> `scripts/gradePacket.ts` are all live, so `npm run grade:packet` and `npm run cost` still cover
> three arms.

**◆ G7 — Retrieval store & method (the pgvector replacement gate). Resolved *by* this phase**, not
before it. Each candidate becomes an adapter behind the N1 interface and is graded on the same eval
set; the winner closes the gate.

| arm | what it does | infra |
|---|---|---|
| `firestore-direct` ✅ built | **Direct feed** — read the corpus slice from Firestore, put it in the prompt whole. No embedding, no ranking, no top-k, structurally no retrieval miss. | none |
| `pgvector-rag` ✅ built, swept, **archived 2026-08-19** | **Legacy-parity RAG** — hybrid dense + Postgres full-text fused with RRF, exactly `MIGRATION_SPEC.md` §7 (with the §4a lexical caveat). Graded from its captured transcripts; the code is in `archive/pgvector-rag/` and the mode is no longer selectable. | Postgres+pgvector sidecar, **dev-only**, archived ahead of G7 |
| `firestore-vector` ✅ built | RAG on Firestore native `findNearest`, dense-only unless a lexical path is built | Firestore vector index |

**The corpus does not fit in context.** 851,891 chars ≈ **213K tokens** across 15 docs since the
2026-08-24 trim (716,603 chars ≈ 179K across 8 docs at the time the arms were swept), so
"direct feed" means a *defined slice*, not everything — see ◆G9. The slice
◆G9 settled on (operator source-of-truth + 4 probe datasheets) measures **~9.4K tokens**, 11,023
prompt tokens as actually sent. Confirm the configured model's real context limit before changing it;
the serverless catalogue rotates.

**Lexical arm is a distinct sub-problem** for the Firestore RAG arm: the legacy retrieval was hybrid
dense + BM25 fused with RRF, and **Firestore has no full-text search**. Either go dense-only and
accept the acronym/exact-token weakness the hybrid was built to fix, or add a lexical path (keyword-token
field + array-contains, or an external text-search service). A pure-vector rebuild changes results —
and the eval set includes acronym queries precisely to expose that.

Build work in this phase:

- **`firestore-direct` adapter** — corpus slice → prompt, in stable document order, behind the N1
  `getContext` interface. Cheapest arm to stand up; build it first.
- **Fireworks embedding adapter** for the RAG arms, preserving the nomic `search_query:` /
  `search_document:` task prefixes (dropping them degrades quality).
- **Ingestion → Firestore** (port of `MIGRATION_SPEC.md` §5): documents → chunks → embeddings;
  preserve chunking (3200 chars / 400 overlap), the quality filter, and OCR for the one scanned PDF.
  Idempotent by filename. Direct-feed needs the document text but not the embeddings.
- **`pgvector-rag` sidecar** — `docker-compose.bakeoff.yml`, never in the deployed image. ✅ built and
  swept; archived 2026-08-19 to `archive/pgvector-rag/`.
- **Eval fixtures** — ✅ **done**: 30 conversations / 62 turns in `eval/fixtures/`, with per-turn
  rubrics, committed before any arm runs. See [`EVAL_FIXTURES.md`](EVAL_FIXTURES.md).
- **Eval harness (programmatic)** — ✅ **done**: `npm run bakeoff`. Replays the fixed **multi-turn conversations** over
  HTTP against each arm in a set order, and saves full transcripts: responses, **the exact context
  supplied to the model** (without it groundedness can't be graded), tool calls, cached/uncached token
  split, TTFT and wall time, plus arm/model/temperature/git-SHA. Temperature pinned to 0; cold and
  warm passes kept separate.
- **Human testing harness (frontend)** — an arm selector in the existing `frontend/index.html`, so
  non-technical testers can exercise the arms in a browser. **Blind by default** (arms shown as
  A/B/C, shuffled per session) because a visible arm name destroys blind grading; a labeled mode
  exists for debugging and its transcripts are tagged as non-eval. Sessions capture to the same
  transcript shape as the runner. Needs `GET /api/v1/retrieval/modes`, gated on `DEBUG_RETRIEVAL`.
  Seeded sessions (tester asks fixture questions) feed the human calibration sample; roaming
  sessions are for discovering missing question classes, which become new fixtures for the *next*
  sweep, never scores in this one. **Not** the N7 Next.js page — this is the throwaway demo UI.
- ~~**An automated §8a gate checker**~~ **— built 2026-08-25**, `npm run gate:check`
  (`src/eval/gates/`). A deterministic pass over saved transcripts deciding the three hard gates:
  no numeric literal in an answer that is absent from its grounding, the pinned `REFUSAL_SENTENCE`
  present on every turn whose rubric demands a refusal, and every `【N†Lx-Ly】` marker resolving to
  context that was actually supplied. No LLM, no network, re-runnable after every corpus change —
  the `RETRIEVAL_EVAL.md` method applied one layer up. It gates admission to the paid judging pass
  rather than replacing it. **Two traps it exists to avoid**, both found by running it and recorded
  in [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §8b: an exact string comparison scores a
  *correct* refusal as zero (the model emits U+2011 where the constant has U+002D, and NFKC folds
  it to U+2010, not U+002D), and the grounding a figure may legitimately come from includes the
  **system prompt's operator ranges** and the user's own question, not just the retrieval context.
- **Grading is a separate offline pass** over the saved transcripts, arms stripped and shuffled —
  human, LLM judge, or judge calibrated against a human sample. If a judge grades: different model
  than the one under test, one dimension per call, and the human-agreement rate reported. Runs
  **only on arms that cleared the automated gates** (`RETRIEVAL_BAKEOFF.md` §8b).
- **Cost accounting covers upkeep, not just tokens** — idle/standing cost per arm (direct-feed: $0;
  deployed `pgvector-rag`: an always-on DB instance that likely dominates at our volume), Firestore
  free-tier headroom, index storage, re-embedding on corpus change, and the legacy FastAPI+pgvector
  cost floor as a reference point.
- **Latency and cost ceilings written down before results** — a quality win that blows the budget
  isn't a win, and setting the bar afterward isn't a test.
- **Deliverable: `docs/RETRIEVAL_COMPARISON.md`** — a committed comparison of every retrieval method
  and its output: headline table (cost/answer cold + warm, cache hit rate, **idle $/mo, 12-month
  TCO**, quality, p95), the upkeep breakdown, break-even chart against projected volume, dated prices
  **and quotas**, side-by-side sample conversations (including a case each arm loses), how quality was
  graded and the judge/human agreement rate, and the decision plus what would reverse it. *This report
  is the point of the phase*, and it's re-runnable when prices, the model, the corpus, or traffic change.

**Decision rule: quality gates, cost decides.** Arms below the correctness/groundedness floor are out
regardless of price; among those that clear it, total cost of ownership at our volume wins; latency is
a veto, not a tiebreaker.

*Exit: every selected arm selectable via config and verified; eval set, rubrics, and raw per-question
results committed; **`RETRIEVAL_COMPARISON.md` written**; ◆G7 resolved with the numbers that resolved
it; ◆G9/◆G10 closed; ~~pgvector sidecar removed~~ **done 2026-08-19, ahead of the decision** — the
sidecar, adapter, seeder and `pg` dependency are archived to `archive/pgvector-rag/` and the mode is
unregistered, with the transcripts, grading key and cost scenario retained so the remaining criteria
above are all still reachable. A **split outcome is a legitimate result** —
direct-feed the small authoritative tier, RAG the long manuals — and the adapter registry composes
that without a rewrite.*

---

## Phase N3 — Sensor data on the new stack
*Goal: restore `query_sensor_data` and the backend-mediated real-data path.*

**◆ G8 — RESOLVED → go straight to the device API.** No Firestore port of the CSV. Rationale: it is
the most direct path to wiring this service into the real system, and a synthetic Firestore store
would be work thrown away the moment real data arrives. The data-source abstraction still applies —
one tool, swappable adapters — so a synthetic adapter can still be added later for offline testing if
it proves necessary.

**Full contract, credentials, and the exploration/recording plan:
[`migration/DEVICE_API.md`](migration/DEVICE_API.md)** — written 2026-08-11 from a read-only sweep
of **both** reference repos. It supersedes the dashboard-only table below on three points: the
production base URL (the dashboard proxies server-side, so its own env var is empty in prod),
turbidity's provenance (derived from a raw voltage by a **provisional, uncalibrated** conversion —
see §8, it qualifies a pinned N2 control), and a shifted metric-code table in the backend's
alerting service that must not be ported. **The pod names are in neither repo** — the device list
is runtime-only, so `npm run explore:devices` against the live API is the only way to confirm
"Algalita pod" / "OWC 2026".

The **read-only data layer is built and verified live 2026-08-11** (client, metric decoding,
exploration/recording script, 45 offline tests at that point). The tool loop and the prompt's tool
block were deferred at that stage, because both would have voided the N2 arms; they landed two days
later **behind `SENSOR_TOOL`, default off**, which resolves the objection without re-running an arm
— see the 2026-08-13 status below and `DEVICE_API.md` §10.

**Test pods confirmed:** `Algalita Pod` = `dev:351077454569099` (salt-water, reporting) and
**`Old Woman Creek 2026`** = `dev:351077454567580` (fresh-water, stale since 2026-08-07). Note the
second is *not* named "OWC" anywhere — the acronym matches nothing.

Three findings from the live run that bear on later phases (`DEVICE_API.md` §12):

- **Temperature's unit varies by endpoint** — °F from `/water/last` and `/water/average`, raw °C
  from `/water/period`, with nothing in the payload to say which. Normalized in the decoder.
- **An empty window returns zeros for all six metrics**, not an error — "no data for the last day"
  is otherwise indistinguishable from anoxic water at pH 0. Guarded; this is a hard requirement
  for `query_sensor_data`, since reporting it would be a fabricated figure.
- **The two test pods are different water types**, so `WATER_TYPE` as a global env var cannot serve
  both. Water type must move to per-device metadata — **Phase N4, and an input to ◆G3**.
  Separately, Algalita reads **54,100-60,200 µS/cm against a stated saltwater range of
  40,000-50,000** — an operator question, not a code fix.

**Contract, confirmed by reading `../user-dashboard` (read-only):**

| item | value | source |
|---|---|---|
| Base URL | `NEXT_PUBLIC_API_BASE_URL` + **`/api/v1`**; dev default `http://localhost:5001` | `services/axios.config.js` |
| Auth | `Authorization: Bearer <jwt>`; the dashboard reads it from `localStorage.token` | `axios.config.js` interceptor |
| Token source | `POST /users/login` → `accessToken` \| `access_token` \| `token` | `services/auth.ts` |
| Endpoints | `/devices`, `/water/last/{device}`, `/water/average/{duration}/{unit}`, `/water/period/{duration}/{unit}`, `/water/chart/{duration}/{unit}/{metric}/{tz}`, `/water/tides/{device}/{start}/{end}`, `/water/export/csv/{device}` | `services/device-data.js` |
| Metric codes | pH **99**, ORP **98**, DO **97**, conductivity **100**, temperature **102**, **turbidity 72** | `MetricsDictionary` |
| 401 handling | dashboard clears the token and redirects to login — this service must surface expiry, not retry blindly | `axios.config.js` |

- **Device-API adapter:** call `/water/*` + `/devices`, forwarding the caller's bearer JWT. Decode the
  numeric metric keys via the mapping above.
- Reproduce the aggregations (min/max/mean/median/latest/raw), natural-language time-range parsing,
  and the **reference-time = latest reading** rule (`MIGRATION_SPEC.md` §8) on top of whatever the API
  returns — the endpoints are period/average shaped, so some aggregation stays local.
- **Still unknown, revised 2026-08-11:** ~~the deployed base URL~~ — **resolved**,
  `https://cer-api-98242557946.us-central1.run.app/api/v1`. ~~a QA mirror~~ — **there is none**;
  "qa" selects a different Firestore database on the same deployment, so any live call reads
  production. What remains: **a working token** — the one item that still needs a person, see
  [`migration/DEVICE_API.md`](migration/DEVICE_API.md) §5 — and the **exact response body of each
  `/water/*` endpoint**, which `npm run explore:devices` records the moment a token exists.

**Also lands here: the tool-calling orchestration loop** (`MIGRATION_SPEC.md` §3), deferred from N1.
N1 makes a single LLM call with no tools; the legacy loop — up to `MAX_TOOL_ROUNDS = 5` tool-enabled
rounds plus one forced text-only round, tool dispatch, `role:"tool"` messages keyed by
`tool_call_id`, and the round-cap fallback — has to come back before any tool is usable. N5's
"raise the tool-round cap" item depends on this existing first.

**Status 2026-08-13 — built, behind a flag.** `query_sensor_data` and the tool-round loop are
implemented and tested offline against recorded production responses. They are gated on
**`SENSOR_TOOL`, which defaults off**, because the tool block changes the system prompt and the
prompt is a pinned control for the N2 bake-off while ◆G7 is open (`RETRIEVAL_BAKEOFF.md` §4). With
the flag off the prompt is byte-identical to the one all three captured arms ran against — pinned by
a hash in `test/unit/prompt.test.ts` — and no `tools` array is attached to a request.

What landed:

| piece | where |
|---|---|
| Tool definition + implementation | `src/tools/querySensorData.ts` |
| Typed programmatic surface for N6 reports | `QuerySensorData.query()` |
| NL time-range parsing, reference-time rule | `src/tools/timeRange.ts` |
| min/max/mean/median/latest/raw | `src/tools/aggregate.ts` |
| Tool-round loop, dispatch, round-cap fallback | `src/services/ChatOrchestrator.ts` |
| Prompt tool block (flag-gated) | `src/prompt/systemPrompt.ts` (`TOOL_BLOCK`) |
| Offline fixtures | `test/fixtures/device-api/` |

Three decisions worth keeping, because they are not obvious from the code:

- **`/water/average` is never called.** Every statistic is computed locally from the raw period
  series. The endpoint returns zeros for all six metrics on an empty window and drops whole rows
  when any single probe faults (`DEVICE_API.md` §12b, §6); computing locally avoids both and makes
  validity per-metric. A test asserts the endpoint stays unused.
- **An empty window returns `value: null`, never `0`**, with `device_last_reported` so the answer
  can be "silent since the 7th" rather than "no data". A fabricated zero is the eval's automatic
  disqualification.
- **Ranges anchor to the device's newest reading, not the wall clock** (`MIGRATION_SPEC.md` §8).
  Old Woman Creek has been silent since 2026-08-07, so a wall-clock "last day" is empty on a pod
  that has a perfectly good last day of data. The anchor is read from one `/water/last` call and
  the period window is then sized once to reach back to the range's start — sizing it from the
  phrase alone fetches short on a stale pod and reports a real statistic over a fraction of the
  window it claims. When `/water/last` gives nothing (it drops readings with no GPS fix), a
  widening probe looks for data the filter hid.

**◆ G11 is still open** and untouched by this: `search_documents` did **not** return as a tool.
Retrieval still runs before the call and arrives as CONTEXT.

### N3 follow-up, 2026-08-16 — capability round two

Live testing found the tool could not express a question a user actually asked. "What is the
earliest reading from the Algalita Pod?" has no `earliest` aggregation, so the model reached for
`raw` — which caps at `RAW_LIMIT` **keeping the newest rows** — and reported the 200th-from-last
row's date, 2026-08-12, as the pod's first reading. The true first reading is 2026-06-13. A real
value, a real timestamp, the wrong question answered.

Added, all inside the `SENSOR_TOOL` gate so the pinned prompt is untouched:

- **`earliest`** — the mirror of `latest`, exact and never truncated.
- **`series`** — epoch-aligned buckets with per-bucket mean/min/max/n, width auto-derived from the
  window's span. Trends stop being arithmetic the model does over possibly-truncated raw rows.
- **`metric: "all"`** — every parameter from one fetched window. One API call instead of six.
- **`truncated_kept`** on `raw`, and **`window_actually_searched`** alongside `time_range_resolved`
  — both because "truncated" and "resolved range" alone let a reader mistake a window boundary for
  a reading.
- **`QuerySensorData.query()`**, the typed path for N6's report generation.

**The sequencing note that was wrong:** an earlier draft said this work should wait for ◆G7. It
should not have. ◆G7 pins the **flag-off** prompt; everything here lives in `TOOL_BLOCK` and the
tool schema, both of which only reach the model when `SENSOR_TOOL=true`. Building behind the flag
was always safe — only *capturing arms* with it on is not.

**Two data-quality findings for the operator, not for us to fix:**

1. **The pod's first-ever reading is a boot artifact** — 2026-06-13T16:17:56Z reports pH 13.578,
   temperature −1809 °F, conductivity 0, DO 34.91 mg/L. **Its error flags are not set**, so it
   survives the fault filter and `earliest` over a full history returns it faithfully. This is
   N6's faulty-data work (a plausibility floor per metric, distinct from the hardware flags).
2. Across a year, 11–17 rows per metric *are* flagged faulted and correctly excluded — so the
   flags work, they just do not catch this.

*Exit: unchanged and still met.*

**N5's "raise the tool-round cap" landed here, early.** `MAX_TOOL_ROUNDS` defaults to **16** (plus
the forced text-only round), not the legacy 5 — `sensor-doc-event-check` asks for six parameters and
then reasons over them, which five rounds cannot fit. The loop serves repeated identical calls from
cache so a stuck model cannot spend the larger budget re-asking one question.

**Still open, deliberately not fixed here:** `WATER_TYPE` is a single global env var, and the two
cleared pods are different water types — one deployment cannot serve both (`DEVICE_API.md` §12c).
The tool *flags* the disagreement in its result rather than silently comparing a saltwater pod
against freshwater limits. Making water type per-device is Phase N4's site/device metadata store and
an input to **◆G3**.

*Exit: `query_sensor_data` answers questions about both cleared pods end to end through
`POST /api/v1/chat`; the orchestration loop handles multi-round calls and the round cap; the two
`sensor-tool` fixtures are runnable with the flag on (30/30). Reached 2026-08-13.*

---

## Phase N4 — Data layer & schema evolution `⟵ was Phase 1`
*Goal: get the data model to where features need it.*

> **Status, partial.** Turbidity is end to end (metric code `72`, decoded, ranged in the prompt,
> and expressed as clarity bands in the report — `migration/DEVICE_API.md` §8b). The metadata this
> phase wanted a store for turns out to already exist in the **backend's device registry**, so
> nothing new was built to hold it: the report reads `operatingEnvironment` for water-body type and
> `thresholds.min/maxTemperature` for the site baseline, both per device
> (`src/report/buildReportInput.ts`, `src/report/operatorThresholds.ts`, `migration/BACKEND_FIELDS.md`).
> **The chat path is unchanged** — it still reads the single global `WATER_TYPE`, because moving it
> per-device means editing the pinned system prompt. ◆G3 stays open: what the report calls a
> baseline is the operator's registry range, adopted as a working interpretation, not a decision.

- **Add `turbidity` (NTU) end-to-end** — ingestion unit detection and the metric enum. The
  **operator normal-range and system-prompt range block landed early (2026-07-29)** — `0-25 NTU`
  freshwater / `0-10 NTU` saltwater — because the N2 eval could not measure retrieval while the
  prompt still declared turbidity unmeasured. See the session handoff.
- **Encode the "0 is valid" rule** for turbidity *and* ORP into the faulty-data foundation. The
  system-prompt range already starts at 0 for turbidity.
- **Site/device metadata store** — coordinates, water-body type, client/contract, per-sensor
  calibration dates (needed for the report header + §5).
- **◆ G3 — Site-baseline definition** (carried forward): is the report's "Site Baseline" the
  operator-provided normal range, or computed from historical per-site data? Gates the flag logic.
- **Site baseline + flag logic** — per-site, per-parameter min–max + deterministic Flag
  (Normal/Elevated/Low/Exceedance).

*Exit: 6 metrics queryable end to end; turbidity returns sane values + units; baseline/flag computable.*

---

## Phase N5 — Core behavior & UX quality `⟵ was Phase 2`
*Goal: cheap, high-visibility correctness/polish.*

> **Status: most of the list below has landed.** Markdown rendering + XSS hardening, provenance
> surfacing, the input/response controls, the series chart, `【commentary…】` stripping, the error
> taxonomy, the generated starter prompts and the pod picker are all in the tree.
> [`CHAT_UX_WORKPLAN.md`](CHAT_UX_WORKPLAN.md) is the home for what each stream delivered and what
> is still open; the list here is kept as the phase's scope, not as a to-do.

- ~~Raise/remove the tool-round cap~~ **— done early in N3 (2026-08-13).** `MAX_TOOL_ROUNDS`
  defaults to 16 plus the forced text-only round; it was raised with the loop rather than after it,
  because the six-parameter eval fixture cannot run at 5. Still a **hard dependency for reports**;
  re-check the number once a report actually exercises it.
- System-prompt personality (friendly; steers toward water-quality topics). ~~**Blocked by ◆G7**~~
  — **unblocked 2026-08-26** when ◆G7 split and the prompt was unpinned. Note the new constraint
  that replaces the old one: prompt changes now invalidate the captured arm comparison, so
  personality work and the groundedness fix should land together and be re-captured once, not
  separately and re-captured twice. Historically: the
  prompt was a pinned control while the bake-off was ungraded, and a personality edit voided all
  three captured arms — which is why this was the one N5 item that could not start.
- Strip `gpt-oss-20b`'s `【commentary…】` markers. **Post-processing on the answer, never a prompt
  instruction**, for the same reason.

### Answer rendering

- **Markdown rendering + XSS hardening** — tables, bold, lists, code. The model's output is untrusted
  input; it is rendered as HTML, so sanitization is part of the feature, not a follow-up.
- **Show retrieved chunks + inline quote citations**; **no public links** to source-of-truth docs.
- **Sensor readings as a compact table** with units and the faulted-sample count, rather than prose
  the model reassembles.
- **Inline chart for `series` results.** The tool already returns epoch-aligned buckets with
  mean/min/max/n — the data is there and currently unused. Distinct from the report's "no
  visualizations in v1" rule, which governs the PDF, not the chat.

### Provenance surfacing

Everything here is already in the response body and invisible to the user today.

- **Render `tool_calls`** — "queried Algalita Pod · last 24h · mean DO". `tool_calls` is the
  diagnostic the runbook tells operators to read; the UI should not make them open DevTools for it.
- **Data-freshness badge.** Ranges anchor to the device's newest reading, not the wall clock, so "the
  last day" on a stale pod means *its* last day. Old Woman Creek has been silent since 2026-08-07 and
  nothing on screen says so.
- **Caveat badges** for what the tool already flags: turbidity provisional/uncalibrated, and the
  `WATER_TYPE`-vs-`operatingEnvironment` mismatch.
- **Refusals styled as intentional**, not as errors. The refusal sentence is a pinned behavior; a
  refusal that renders like a crash reads as a bug and will be reported as one.

### Input & response controls

- Multi-line input (shift+enter, autosize).
- **Starter prompts**, generated from `eval/fixtures/` rather than hand-written — the question set is
  already curated and stays in sync for free.
- **Pod picker + time-range chips**, so a user need not name a device in prose. `SENSOR_DEVICE_LABEL`
  is deliberately unset because guessing between two pods on opposite coasts is unsafe; a picker
  removes the guess instead of defaulting it.
- **Stop generation.** The server already aborts the upstream call on client disconnect via
  `AbortController`; this is mostly a button.
- Copy answer, copy table, regenerate.

### Error UX

- Distinguish **503 no key**, **401 expired token**, **device-API timeout**, and **empty window**.
  Token expiry must be *surfaced*, not blindly retried (`DEVICE_API.md`); the dashboard's own
  interceptor clears and redirects.
- **"Pod silent since Aug 7", never "no data"** — and never `0`. A fabricated zero is the eval's
  automatic disqualification, and the same rule applies to how the UI renders `value: null`.

### Feedback loop

- **Thumbs up/down + optional comment on any answer.** Sized here because it is cheap and because it
  closes the eval loop: a flagged answer converts directly into a new fixture for the next sweep.
- A dedicated "this number looks wrong" path on sensor answers, which is a different failure from a
  bad document answer and should not land in the same bucket.

*Exit: chat renders rich answers with grounded, non-hallucinated, link-free citations; multi-tool
answers complete; every sensor answer shows which pod, which window, and how fresh the data is.*

---

## Phase N6 — New features & report generation `⟵ was Phase 3`
*Goal: the net-new asks, built on the compute/narrate principle.*

> **Status: report generation and the faulty-data foundation are built.** The pipeline is
> `src/report/` (`buildReportInput`, `events`, `referenceRanges`, `operatorThresholds`,
> `narrative`, `renderPdf`), reached through the `generate_report` tool and gated on **`REPORT_TOOL`,
> default off** — same pinned-prompt reason `SENSOR_TOOL` is. Still open in this phase: document
> upload/delete, and §4 event detection behind ◆G4.
>
> **Amended 2026-08-28, after the first 30-day report off live Algalita data** (rendered with
> `npm run report:render`, which drives the pipeline with no server and no LLM). Five decisions
> the report layer now carries, all of them visible in that PDF before they were fixed:
>
> - **Severity no longer escalates alone.** `overallStatus` requires `confidence >= 0.5`
>   (`CONFIDENCE_FLOOR`, types.ts) before a High-severity event can reach "Action Required".
>   Severity is computed from duration only, so a 30%-confidence window already downgraded to
>   "Inconclusive" was putting "Action Required" on the cover and making the recommendations
>   tell the reader to notify an authority.
> - **A window covering ≥80% of the period is a persistent offset, not an event.** It is capped
>   at Moderate and worded as a baseline that may not fit the site — the honest reading of pH
>   averaging 7.00 for 30 days against a seawater 7.8–8.3 range.
> - **Section 2 gains an "Out of range" column** (`outOfRangeShare`): the share of series buckets
>   outside baseline. A flag alone cannot separate one stray reading from a month-long offset,
>   and on this pod it separated ORP at 3% from pH at 100%.
> - **Section 3 reports both excursion directions.** It printed only one, so dissolved oxygen
>   showed its 23.32 mg/L peak and hid the 1.72 mg/L trough.
> - **Section 4 movement clauses name their basis** — bucket-mean peak *and* the period extreme
>   — because the two sections were printing different numbers for the same parameter.
>
> The renderer itself was reworked at the same time (masthead with a status pill, per-parameter
> sparkline with the baseline band shaded, page footers). No new dependency: it is still pdfkit.

- ~~**Faulty / erroneous sensor-data handling**~~ **— built.** Per-metric physical-plausibility
  rails in `src/devices/plausibility.ts` catch the probe rails the hardware's own error flags miss
  (the −1809 °F / pH 13.58 boot artifacts); excluded rows are counted back as
  `excluded_implausible` rather than dropped silently. Operator-entered temperature baselines are
  read and validated in `src/report/operatorThresholds.ts`, which refuses junk registry values
  rather than printing them. Recalibration *guidance* still needs the corpus grounding below.
- ~~**Sensor datasheet into corpus**~~ **— done.** The four Atlas Scientific probe datasheets are
  Tier 1 and in the ◆G9 slice; the EPA field-calibration SOP is Tier 3.
- **Document management** — upload + delete source-of-truth docs with auto-seed on upload.
- **◆ Report generation** to the six-section template. Compute the header/§2/§5 deterministically;
  narrate §1/§3/§6 with the LLM over pre-computed facts; §4 event-detection is compute + narrate.
  Build order: §2 + header → §3 → §5 → §6 → **§4 last** (own spike, gated by G4).
- **◆ G4 — Event-detection context** (carried forward): does §4 run on sensor signals alone, or is
  rainfall/tidal/vessel-activity context fed in manually? Gates §4.
  **New input, 2026-08-20:** the vendor's own product guide states that the *existing* Gilligan
  "uses NOAA historic datasets, and live data from your smart buoy to analyze pollution risks"
  (`migration/DEVICE_API.md` §14c). So the shipped product already answers this gate with "external
  context is fed in" — which makes G4 less a design choice than a question of **what NOAA dataset
  and by what path**. Confirm before designing §4; we knew only that `/water/tides` is a NOAA
  passthrough, and historic-dataset analysis is a larger claim than that.

*Exit: each feature demoable on synthetic data; report generation produces a template-conformant report.*

---

## Phase N7 — Frontend migration & integration `⟵ was Phase 5`
*Goal: replace the existing Gilligan feature with the new bot.*

- Build the **Next.js dedicated chatbot page** (replaces the demo's single-file `frontend/index.html`).
- Re-point the dashboard's `services/gilligan.js` from `/gilligan/*` to the new `/chat`; match
  request/response shapes; retire/re-map `askGilligan`/`getChats`/`checkQuota`.
- **◆ G5 responsiveness** (mobile/tablet) and **◆ G6 redesign vs. match existing style** — both gate
  the UI build. **Neither is blocked by anything; they are the cheapest way to unblock this phase.**

### Persisted chat history

Distinct from the per-request `history` array N1 already accepts. That one is client-supplied,
trimmed to `MAX_HISTORY_MESSAGES`, and forgotten the moment the response is sent — it makes a
conversation coherent, not durable.

> **This is parity, not enhancement (2026-08-20).** The vendor's product guide shows the shipped
> Gilligan with a **persisted chat-history sidebar** listing dated past conversations
> (`migration/DEVICE_API.md` §14c). Replacing that feature without durable history is a visible
> regression for existing users, so this item cannot be deferred out of N7 the way a new feature
> could — it moves with the replacement or the replacement waits.

- **Auth is the hard prerequisite.** There is no authentication in this service today, and a
  conversation cannot be scoped to a person without an identity. It lands here rather than in N5
  because N7 is where the dashboard's JWT arrives — the same token already forwarded for sensor
  calls. Until then, persisted history, per-user quota, and per-user device scoping are all blocked
  on the same thing.
- Firestore conversation store: list, resume, rename, delete, and a `new chat` action.
- Server endpoints for the above; the legacy `getChats` gives the shape to port.
- Export a conversation (markdown). **Share links are deliberately out** — a transcript contains
  customer sensor readings, which `SPECS.md` §18 treats as confidential.
- **Token streaming with tools on.** Today the finished text arrives as one `token` event because the
  loop cannot know a round is the last until it returns without tool calls. Real streaming needs
  incremental `delta.tool_calls` assembly. This is the phase that wants it.

*Exit: chatbot reachable from the dashboard, styled per decision, answering end to end, with
conversations that survive a page reload.*

---

## Phase N8 — Testing & demo `⟵ was Phase 6`
*Goal: provable behavior + presentation material.*

- **Mock conversation set** for testing and demo.
- Extend the test suite for the new metrics, tool-round cap, faulty-data handling, and the report's
  computed layer (the compute/narrate split makes every number testable).
- Walk the acceptance conversations (sensor-only, is-this-normal, definitional, follow-up, precedence,
  out-of-scope refusal) — these *demonstrate*, not build.

*Exit: green test suite + a scripted demo covering each feature.*

---

## Phase N9 — Deployment `⟵ was Phase 7`
*Goal: ship. Local/demo now; **Cloud Run** when promoted.*

- **Now:** local end to end (`npm run dev`, or the Docker image).
- **Later (Cloud Run):** deploy alongside the dashboard/backend; listen on `PORT`/`8080`; secrets from
  env; Firestore via the service's runtime service account.
- Pre-prod hardening: **CORS lockdown**, `/health` extended to a real readiness probe, and the
  **privacy bar** (signed DPA / ZDR with Fireworks) before any real data flows.

---

## Cross-cutting: data requirements

1. **Sensor time-series** — per device, per timestamp: DO, ORP, pH, conductivity, temperature,
   turbidity. **Live since N3**: numeric-keyed from the production API, decoded in
   `src/devices/metrics.ts`. *0 is valid for turbidity and ORP.*
2. **Operator normal-ranges / site baseline** — per metric, per site; authoritative over documents.
   Add a turbidity range. See ◆G3.
3. **Site/device metadata** — coordinates, water-body type, client/contract, calibration dates.
4. **Source-of-truth corpus** — **15 active docs since 2026-08-24** (operator source-of-truth, 4
   Atlas Scientific probe datasheets, the 9-chapter USGS National Field Manual A6 set, and 1 EPA
   field-calibration SOP; **851,891 chars / 393 chunks**, expanded to 18 docs / ~1.25M chars on
   2026-08-21 and trimmed back on 2026-08-24 — the EPA standards handbook and the two
   pollution-event references carried no numeric criteria for any measured parameter). No public
   links. Breakdown, the USGS edition-currency check, and the two ingest traps:
   [`../documents/README.md`](../documents/README.md).
   *Still missing from Tier 1: turbidity and temperature probe datasheets.*
5. **Unit confirmations** — turbidity (NTU vs FNU) before answers quote it as fact.
6. **Auth context** — the user's JWT, forwarded for backend-mediated sensor calls, scoped so the bot
   only sees that user's rovers.

---

## Open gates summary

| Gate | Decision | Status | Blocks |
|---|---|---|---|
| ◆ G1 | Target stack (A/B/C) | **Resolved → C (Node/Express + Firestore)** | — (unblocked all) |
| ◆ G7 | Retrieval strategy: direct-feed vs RAG (and, if RAG, vector method + lexical arm) — **decided on cost**, with quality as a floor | **Split 2026-08-26.** Retrieval half **CLOSED**: `firestore-direct` on the evidence in `RETRIEVAL_COMPARISON.md` §7. Quality floor **re-filed as a system-level deploy blocker**, thresholds carried forward verbatim and still **unmet** (§8c). The system prompt is **unpinned**, which releases N5's personality item and ◆G11. Historical blocker, revised 2026-08-25 (`RETRIEVAL_BAKEOFF.md` §8b): re-capture on the 15-document corpus → automated pass on the three hard gates → LLM judge on the survivors → `RETRIEVAL_COMPARISON.md`. Only `firestore-direct`'s transcripts survived the corpus change. The offline retrieval harness and its four new arms **do not advance this gate** — §8a's targets are all answer-quality and recall/MRR are diagnostics with no target | Phases N2→N6; the pinned system prompt, which blocks N5's personality item. **No longer blocks pgvector archival** — that was taken ahead of the gate on 2026-08-19 (see "Where we are now"), with the evidence retained so grading is unaffected |
| ◆ G9 | Direct-feed corpus slice | **Resolved → operator source-of-truth + 4 probe datasheets (~9.4K tokens)**. Revised 2026-07-29: the original small tier was 83% a structurally shredded criteria table covering pollutants this sensor cannot measure | — |
| ◆ G10 | Third bake-off arm | **Resolved → yes, three arms**: `firestore-direct`, `pgvector-rag`, `firestore-vector`. Also answers whether Firestore's own vector search is good enough if RAG wins | — |
| ◆ G11 | Does `search_documents` return as a **tool** after ◆G7 settles, or is up-front retrieval permanent? A hybrid — up-front retrieval for the first pass, an optional follow-up search tool for multi-part questions — is plausible. Decide **after** N2, so the bake-off measures strategies rather than tool-calling behavior | Open — **cheaper now**: N3 built the loop, so adding it is one entry in `buildToolRegistry` plus a prompt line, not new machinery | multi-part answer quality |
| ◆ G8 | Sensor-data store (Firestore port vs device-API) | **Resolved → device API** (most direct path to the real codebase) | — |
| ◆ G3 | Site-baseline definition (operator range vs. computed) | Open. An operator meeting restated it as "pull ranges from the registry, refine per site from history" — decoded, with the prompt-caching and `precedence`-fixture constraints that shape any implementation, in [`RESPONSIBILITY.md`](RESPONSIBILITY.md) | Phase N4 flag logic |
| ◆ G4 | Event-detection context source | Open | Phase N6 §4 |
| ◆ G5 | Frontend responsiveness (mobile/tablet) | Open | Phase N7 UI |
| ◆ G6 | Redesign vs. match existing style | Open | Phase N7 UI |
| — | Turbidity metric **code** | **Resolved → `72`** (from `user-dashboard` `MetricsDictionary`) | — |
| — | Turbidity **unit** (NTU vs FNU) | **Resolved → the fleet reports NTU** (white-light). NTU and FNU are not interchangeable (FNU = infrared), so a pod reporting FNU is not comparable without re-deriving the range. Source: operator source-of-truth §6; unit confirmed by operator 2026-07-29 | — |

---

## Eval rebuild — 2026-09-01

**The evaluation apparatus was rebuilt from scratch, and ◆G7's retrieval half should be treated as
re-opened in substance even though it is recorded above as CLOSED.**

The 2026-08 result did not survive scrutiny for three independent reasons: every capture ran on
`gpt-oss-20b`, a placeholder model being replaced by `gpt-oss-120b`; the arms were compared on a
system where 53–59% of turns carried an ungrounded claim, so the headline "extra chunks dilute"
finding was measured on a model ignoring its grounding instructions half the time; and 27 of the 30
fixtures were answerable from 4.4% of the corpus, with three fixtures carrying the whole
`deep-in-manual` class. The plan, the pre-registered thresholds carried forward verbatim, and the
five wave-1 exit criteria are in **[`EVAL_REBUILD.md`](EVAL_REBUILD.md)**, which is the file a cold
start should read first.

**Whether ◆G7 is formally re-opened and re-closed on new evidence is a Phase 4 decision**, with the
entry to be written here at that point. Until then: **treat every retrieval arm as unranked.**

| decision | date | record |
|---|---|---|
| Corpus re-ingested without the alpha-ratio filter — **393 → 451 chunks** | 2026-08-31 | The filter removed 42 numeric tables (34 of them the `usgs-nfm-a6.2` oxygen-solubility tables) and **zero** chunks of OCR noise, the only thing it exists to catch. All 393 existing content-derived ids survived. `EVAL_REBUILD.md` §2b, `SPECS.md` §"chunking" |
| Chunking parameters **frozen** | 2026-08-31 | Changing any voids every retrieval label; ids are content-derived SHA-256. `EVAL_REBUILD.md` §2b |
| Judge settled: **`deepseek-v4-flash-0731`** | 2026-08-31 | Correctness κ 0.937 on the 24 comparable human rows; the only candidate clearing κ 0.70 on all three dimensions, and cross-family against both the fixture author and the generator. Provisional until Phase 2c re-measures κ. `EVAL_REBUILD.md` §3a |
| Fixture set rebuilt: **46 fixtures / 92 turns**, seven classes | 2026-09-01 | Five of the twelve `EVAL_CLASSES` deliberately unpopulated. `EVAL_REBUILD.md` §2 |
| **Old eval artifacts archived** — 556 files, ~20MB | 2026-09-01 | Tag `eval-archive-2026-09-01`. Covers `eval/{fixtures,fixtures-next,retrieval-labels,transcripts,grading}/`. Breaks `--calibrate` until Phase 2c, deliberately. [`ARCHIVED.md`](ARCHIVED.md) |
| Wave-1 **exit criterion 1 passes** — contamination 22.8% document-level, 11.6% chunk-level, against a < 40% bar | 2026-09-01 | `eval/fixtures-wave1/_CONTAMINATION.md` |
| Phase 2b done: judge repointed | 2026-09-02 | `DEFAULT_JUDGE_MODEL` had still been `gpt-oss-120b`, which had become the production generator — the default judge was set to grade its own output. Guarded by a test that fails if it is put back |
| Alpha-ratio filter defaulted **off** | 2026-09-02 | It defaulted *on* while the sole production caller passed `false` and no test covered the ingest path, so deleting one argument would have silently re-filtered the corpus to 393 chunks with the suite green |

**Known blocker on Phase 3.** The Tier 1 refusal gate detects refusal-required turns by
regex-matching rubric prose, and matches **0 of wave 1's 8 refusal turns** — the new set phrases the
requirement as "Declines to…" rather than "refuses to answer". `refusalMap()` now throws rather than
reporting a vacuous 100% pass. The fix is a per-turn `requires_refusal` flag on the fixtures.

---

## Session handoffs

**The current handoff is [`HANDOFF_2026-09-10.md`](HANDOFF_2026-09-10.md).** Read it first for
session state, open blockers and who owns each one, then **[`EVAL_REBUILD.md`](EVAL_REBUILD.md)**
for the eval plan and its phase order.

[`HANDOFF_2026-08-27.md`](HANDOFF_2026-08-27.md) is **superseded for session state** but still
current for the device-API and report work it describes; its eval sections were superseded earlier
by the rebuild, and it carries a banner marking which.

The 2026-07-31 / 2026-08-04 handoff that used to sit here has been removed — every item it listed as
pending has since happened, and it had begun to contradict the phases above. The findings it carried
that are still in force live in their permanent homes:

| finding | now recorded in |
|---|---|
| Prompt caching works; the cached-input discount does not invert the cost story on `gpt-oss-20b` but does on `120b` | [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §1b |
| Fireworks embeddings return a corrupt 192-element all-zero vector without `encoding_format` — do not remove either guard | [`SPECS.md`](SPECS.md) §14 |
| Quality floor and latency ceiling, fixed before any arm ran | [`RETRIEVAL_BAKEOFF.md`](RETRIEVAL_BAKEOFF.md) §8a |
| Firestore document-size limit and why `chunks` is not stored | [`SPECS.md`](SPECS.md) §11 |
| Environment traps (~80s `ts-node` cold start, `docker-compose` not `docker compose`) | [`README.md`](../README.md) §11 |
