# Eval Rebuild — plan and context

The evaluation apparatus is being rebuilt from scratch. This file is the working plan and the
only context a fresh session needs. It replaces reading the bake-off documents.

**Read this, then `CLAUDE.md` (house rules), then start at Phase 0.** Do not read
`RETRIEVAL_BAKEOFF.md` or `RETRIEVAL_COMPARISON.md` unless a task here sends you there — they
document a completed experiment whose conclusions are superseded by §1 below.

---

## 0. Why this is happening

The previous evaluation produced a decision that does not hold up, for three independent reasons.

**The arm comparison was confounded by broken generation.** Retrieval arms were compared on a
system where 53–59% of turns carried an ungrounded claim and correctness sat at 1.08 against a
1.30 floor. The headline retrieval finding — that extra chunks *dilute* and hurt answers — was
measured on a model ignoring its grounding instructions half the time. Fix generation and that
finding may shrink, vanish, or reverse. Nobody knows.

**The gate closed in the wrong order.** ◆G7 was split on 2026-08-26: the retrieval half closed on
`firestore-direct`, the quality floor was re-filed as a deploy blocker. That was a reasonable
escape from a real deadlock (the prompt was a pinned control, so quality could not be worked on
without voiding the arms). But it left a provisional result recorded as CLOSED, and everything
downstream treated it as settled.

**Every number was measured on a placeholder model.** All captures ran on `gpt-oss-20b`, which was
never the intended shipping model. The oracle-router ceiling of 1.155, the dilution finding, the
per-class results — all are properties of a model that is being replaced by `gpt-oss-120b`.

**The fixture set also cannot do its job.** 30 fixtures, of which **27 are answerable from 4.4% of
the corpus**. Three fixtures carry the entire `deep-in-manual` class — the whole argument for
retrieval existing in this system. A three-sample class mean has a standard error of 0.43 on a
0/2 scale; it cannot support any conclusion.

---

## 1. Decisions already made — do not relitigate

| decision | status |
|---|---|
| Rebuild the fixture set and labels from scratch | **Settled** |
| Keep the instruments (`gate:check`, `judge`, `cost`, `retrieval:eval`, bakeoff runner) | **Settled** — they are good, hard-won, and their traps are already fixed |
| Archive rather than delete; nothing is `rm`'d | **Settled** |
| Freeze chunking parameters before labelling | **Settled** |
| Fix generation first, then retrieval | **Settled** |
| Pre-registered thresholds carry forward **verbatim** | **Settled — these do not move** |
| Shipping generator is `gpt-oss-120b` | **Settled 2026-08-31 — final production model.** Cost-cleared, §4. Phase 3 is a single-model baseline, not a sweep. |
| The `restore-pgvector` work is dropped | **Settled 2026-08-31.** Not pursued. The tag `wip-restore-pgvector-2026-08-31` stays as the record — it costs nothing and matches the archive-don't-delete pattern used throughout. Do not spend time on it. |
| Fixture-set sizing: two-wave, wave 1 = 88 turns | **Settled 2026-08-31**, §2 |
| Judge is `deepseek-v4-flash-0731` on Fireworks | **Settled 2026-08-31, shipped 2026-09-02.** Highest measured human agreement, cross-family, already wired and priced. §3a. `DEFAULT_JUDGE_MODEL` now carries it, and `test/unit/judge.test.ts` fails if it is put back into the generator's family. |
| Judge must not be in the `gpt-oss` family | **Settled** |
| Fixture author, judge, and generator must be three different families | **Settled** |

**The thresholds, carried forward unchanged from the 2026-07-30 pre-registration:**

| gate | threshold |
|---|---|
| Fabricated figures | **Zero** |
| Other ungrounded claims | ≤2% of turns |
| Refusal integrity | 100% |
| Citation validity | ≥95% |
| Correctness, per class | ≥1.00 / 2 |
| Correctness, overall | ≥1.30 / 2 |

Thresholds set after the numbers exist are not a test. If you cannot reach them, say so — that is
a finding, not a failure.

---

## 2. Sizing — DECIDED 2026-08-31, two-wave build

The user has chosen the **two-wave** build. This is settled; do not re-ask.

| | turns/class | total turns | ~fixtures | calibration rows | user's time |
|---|---:|---:|---:|---:|---|
| **Wave 1 — build this now** | 8 | **88** | **40–45** | **30** | ~4–6 h |
| Wave 2 — only after the exit criteria below | 12 | 132 | ~60 | +20 | ~3–4 h |

Wave 1 exists to test the *design* end to end before it is replicated at scale. Do not author 60
fixtures against a design that has not produced a number yet.

### Wave 1 exit criteria — all five must hold before building wave 2

These are what "specific metrics are met" means. Check them explicitly and report each one.

| # | criterion | threshold | what failure means |
|---|---|---|---|
| 1 | **Contamination** — BM25 over the finished questions returns the gold chunk at rank 1 | **< 40% of questions** | The questions inherit their source chunks' vocabulary. Wave 2 would replicate the flaw at scale. Fix 1c before proceeding. |
| 2 | **Judge agreement** — Cohen's κ on correctness vs the 30 human rows | **≥ 0.70** | The judge cannot stand in for the human. More fixtures do not help; change the judge or the rubrics. |
| 3 | **Outside-slice coverage** — turns answerable ONLY outside the ◆G9 slice | **≥ 25% of turns** | Either the corpus cannot support the retrieval question, or generation drifted toward easy questions. Both are findings that change the plan. |
| 4 | **Class discrimination** — per-class correctness means are not all within noise of each other | at least 3 classes separated by **> 2 SE** | The class structure is not earning its keep. Reallocate the wave 2 budget rather than spending it uniformly. |
| 5 | **Harness integrity** — Tier 1 and Tier 2 both run end to end on the new set | no harness errors, no unparseable verdicts | Fix the harness before scaling. |

**If a criterion fails, that is a result, not a delay.** Report it, fix the cause, re-check. Wave 2
is a top-up of a design that works, never a rescue of one that does not.

Do **not** allocate uniformly across classes:

- `deep-in-manual`, `cross-document`, `probe-calibration` — **15–20 each.** These separate the arms.
- `definitional`, `follow-up`, `precedence` — **6–8.** All arms tie here.
- `refusal` — **6–8.** Near-binary, reproduces cleanly (measured 30/30).

### Wave 1 class allocation — DECIDED 2026-09-01

Seven classes, 88 turns, 44 two-turn fixtures. `EVAL_CLASSES` in `src/eval/types.ts` still lists
twelve; the five unused ones stay in the type and are simply not populated for wave 1.

| class | fixtures | turns | why |
|---|---:|---:|---|
| `deep-in-manual` | 10 | 20 | Separates the arms. **Absorbs `threshold-lookup`** — same question shape, and it is what the recovered solubility tables serve. |
| `cross-document` | 10 | 20 | Separates the arms. 411 candidate claims tie 2+ metrics. |
| `probe-calibration` | 8 | 16 | Separates the arms, and is forced outside the slice by construction — see below. |
| `precedence` | 4 | 8 | Three verified conflicts already found in Phase 1a. |
| `definitional` | 4 | 8 | All arms tie here. |
| `follow-up` | 4 | 8 | All arms tie here. |
| `refusal` | 4 | 8 | Near-binary, reproduces cleanly. Drawn from the 168 recorded gaps. |

**Dropped for wave 1, with reasons:**

- `acronym-exact-token` — **slice-answerable and therefore structurally unable to discriminate.**
  NTU/FNU and the rest sit in the datasheets and the source-of-truth. Three of the old set's
  fixtures were this class, and that is part of why the old set failed.
- `event-signature`, `sensor-combined` — both depend on the source-of-truth signature matrix, which
  **extraction damaged**: several rows lost cells and one shows five arrows for six columns. A
  fixture on mangled text is wrong, not hard.
- `fouling-drift` — thin support. `a6.0` has zero occurrences of "fouling"; essentially one
  operator-document claim backs the whole class.
- `threshold-lookup` — folded into `deep-in-manual` rather than dropped.

**`probe-calibration` is the structurally strongest class and worth stating why.** The four probe
datasheets give recalibration *intervals* and specifications but contain **no calibration procedure
at all** — no buffer values, no Zobell standard, no air-saturation step. The methods live only in
the USGS manuals, outside the slice. So a question of the form *"the datasheet says recalibrate
yearly — how do I actually do it?"* is forced outside the slice **by construction** rather than by
hoping. That is exit criterion 3 satisfied structurally.

**At least 25–30% of turns must be answerable ONLY outside the ◆G9 slice.** Today it is 3 of 28.
A question answerable inside the slice cannot discriminate between retrieval strategies.

---

## 2b. Chunking — FROZEN 2026-08-31, alpha-ratio filter removed

Recorded here because chunk ids are content-derived SHA-256 (`src/ingestion/chunk.ts`), so
**changing any value below voids every retrieval label written against it.** Adding documents is
safe forever; re-chunking is not.

| parameter | value | where |
|---|---|---|
| Chunk size | **3,200 chars** | `CHUNK_SIZE_CHARS` |
| Overlap | **400 chars**, prepended from the previous chunk | `OVERLAP_CHARS` |
| Splitter | recursive, separators `\n\n` → `\n` → `. ` → ` ` → hard cut | `SEPARATORS` |
| Minimum chunk | **100 chars** | `MIN_QUALITY_CHARS` |
| Alphabetic-ratio filter | **OFF for every document** — and off by *default* since 2026-09-02, so the destructive state has to be asked for | `chunk.ts` `isQualityChunk`, set explicitly at `ingest.ts` |
| Boilerplate drop | `adobe acrobat`, `acrobat reader`, `click here to download` | `BOILERPLATE` |
| Chunk id | `<filenameSlug>__<sha256(text)[0:12]>` | `chunkIdOf` |

**Corpus fingerprint at freeze** — `data/corpus/corpus.json`, re-ingested 2026-08-31:
15 documents, **851,891 chars**, **451 chunks**. Extraction: 14 `pdf`, 1 `ocr-cache`.
◆G9 direct-feed slice: 5 documents, 37,660 chars, **4.4%**.

### Why the filter came out — reversed after the first freeze

The first freeze on 2026-08-31 kept the filter and recorded 393 chunks. That was reversed the same
day, before any label existed, once the cost of keeping it was measured concretely.

`chunk.ts` documented an escape hatch: skip the alphabetic-ratio test for `.md`/`.txt`, where a low
ratio means a table rather than OCR noise. The reasoning was right and **the condition matched
nothing** — every document in this corpus is a PDF, so the exemption was dead code and the filter
ran on all fifteen. What it removed:

| dropped by the filter | chunks |
|---|---:|
| Numeric tables | **42** |
| Table-of-contents dot leaders | 17 |
| Genuine OCR noise — the only thing it exists to catch | **0** |

34 of the 42 were the oxygen-solubility tables in `usgs-nfm-a6.2`, the corpus's authoritative
source for DO threshold lookups. Direct-feed consumes whole document text and kept them; every
vector arm could not retrieve them at all. A `threshold-lookup` question about oxygen solubility
would have scored as "feeding beats retrieving" when it was a filter setting — one more instance of
exactly the confound §0 describes.

**The reversal was nearly free, and measurement is why we know that.** Chunk ids are derived from
chunk text, and the filter runs *after* chunking, so turning it off cannot alter a surviving
chunk's text. Verified rather than assumed: re-ingest kept **393 of 393 existing ids, zero lost**,
and added 58. All 1,023 claims already extracted stayed valid; only `index` moved, and it was
re-derived from `chunkId`.

**The 17 dot-leader chunks now survive too.** They are inert — no real question ranks them — and an
inert chunk is a better failure than a silently deleted table.

### The recovered tables are retrievable, but 11 of them are headerless

Confirmed after re-ingest: BM25 returns `usgs-nfm-a6.2` chunks at rank 1 for solubility and
salinity-correction queries, where before the material did not exist in the index. 30 of the 36 new
a6.2 chunks carry real numeric cells.

**But of the 35 recovered numeric-table chunks corpus-wide, only 24 are self-describing.** The
other 11 are bare number grids whose caption and column header fell on the far side of a chunk
boundary — a retrieval arm handed one of those gets a value with no way to know which pressure or
salinity column it belongs to. **Do not build a fixture whose answer requires a value from a
headerless grid**; it is not honestly answerable from retrieval even now. Phase 1a records which
chunks these are.

### What is safe to change later, and what is not

- **Adding or removing a document is safe.** Ids are content-derived, so existing chunks keep their
  ids and their labels. A removed document's labels go dead and are visible as dead.
- **Editing a document is nearly safe.** Measured: a one-word edit invalidates **0–2 chunks**, never
  the document and never the corpus, because the splitter breaks on `\n\n` first and an edit stays
  inside its own paragraph's chunk.
- **Changing a parameter in the table above is destructive.** All 451 ids re-derive at once.

Phase 1e's **human locator** (document + section + short quote) is the mitigation for all three. It
lets a label be re-resolved against a new chunk instead of re-authored. Phase 1a is already
capturing locators, so the protection is in place before any label exists.

---

## 3. Model roles — three families, three jobs

| role | model | why |
|---|---|---|
| **Fixture author** | Claude (this tooling, human-supervised) | One-time, non-reproducible work where a human checks every output. A CLI agent is the right surface. |
| **Judge** | **`deepseek-v4-flash-0731`** on Fireworks — decided, §3a | Must not be Claude (it authored the fixtures) and must not be gpt-oss (it generates). |
| **Generator** | `gpt-oss-120b` | The product. |

**The judge must be called through an API, never through a CLI.** A judge is an instrument: it
needs a pinned model id, `temperature: 0`, an enforced JSON schema, and per-call usage accounting.
A CLI agent has an uncontrolled system prompt, tool access, session state, and version drift —
none of which can be pinned, and all of which break reproducibility.

`scripts/judge.ts` already accepts `--judge-model=` / `JUDGE_MODEL`, and already guards against the
judge being the model under test (`scripts/judge.ts:240`). Gemini exposes an OpenAI-compatible
endpoint, so it is close to config-only with the existing `openai` client. Anthropic is not
OpenAI-compatible and would need `@anthropic-ai/sdk` plus a small adapter in `judgeOnce`.

Add a `CHAT_PRICES` entry for whatever judge is chosen or the budget line prints blank.

### 3a. Judge — DECIDED 2026-08-31: `deepseek-v4-flash-0731`

**The evidence.** Judge-vs-human on the 24 comparable rows of `eval/grading/warm/scores.csv`
(12 of 36 excluded as stale — the arm was re-captured after grading), computed from the four
ledgers in `data/results/judge/`. No API calls; reproduce with `calibrate()` over each ledger.

| candidate | correctness κ | ungrounded κ | citations κ | signed bias | family |
|---|---:|---:|---:|---:|---|
| **`deepseek-v4-flash-0731`** | **0.937** | **0.577** | **0.440** | −0.042 | cross |
| `nemotron-lightning-3p5-30b-a3b` | 0.898 | 1.000 (n=11) | 0.250 | −0.067 | cross |
| `gpt-oss-120b` | 0.874 | 0.320 | 0.045 | −0.083 | **same as generator** |
| `minimax-m3` | 0.747 | 0.459 | 0.000 | −0.083 | cross |

The only candidate clearing κ 0.70 on all three dimensions. Cross-family — not Claude (fixture
author), not gpt-oss (generator), so §1's three-families rule is met in intent and not only in
letter. Already reachable through the existing Fireworks client and already priced in `prices.ts`,
so Phase 2b was a one-line change to `DEFAULT_JUDGE_MODEL` rather than new transport code.
**Done 2026-09-02** — see §5 Phase 2b.

**Gemini was evaluated and not chosen.** It is a fine judge on paper and remains the fallback if
deepseek fails re-calibration, but it needs base-URL/key selection at `scripts/judge.ts:272-278`,
a `CHAT_PRICES` entry, and one paid pass to get any agreement number at all — against a candidate
that already has one. The AI Studio free tier was considered and rejected on two grounds: Google no
longer publishes free-tier RPM/TPM/RPD (they are per-account in AI Studio, so the workload cannot
be planned against them), and free-tier content is used to improve Google products, which would
send the hand-authored fixture set to a third party. Neither risk buys anything — see §4a, the
whole project runs at $8–11 on deepseek.

**A CLI judge is out, permanently.** Gemini CLI, Claude Code, or any other: no `temperature: 0`, no
`response_format` schema, no per-call token accounting for `JudgeRecord`, no pinned model id, and —
worst — a CLI agent's working directory is this repo, so it can read *this file*, which states the
thresholds and the expected per-class results. That is not a judge, it is a recital.

**Two rules pre-registered now, before any number exists.**

1. **Signed bias is reported alongside κ, always.** κ is symmetric and hides a judge sitting a
   uniform point off in either direction. On current evidence every candidate is slightly *harsher*
   than the human, not more lenient — the opposite of the usual concern — but n=24 and the check
   stays two-sided.
2. **No judge swapping after seeing results.** If a second judge is ever run alongside, the primary
   score stands, the disagreement *rate* is reported next to every result, and turns where the two
   differ by 2 go into the human sample. Picking the judge whose numbers look better is not a
   measurement.

**This is provisional until Phase 2c.** 24 rows on 6 fixtures calibrates an instrument; it does not
conclude anything. §2's exit criterion 2 (κ ≥ 0.70 on correctness) is re-measured against the new
30-row stratified sample, and that is the number that decides whether this judge survives.

Two smaller facts from the same comparison: the `deepseek` ledger is 82 rows, not 83 — one
`ungrounded` call on `firestore-direct | deepmanual-stabilization-criteria | turn 2` was never made.
And `nemotron`'s ungrounded κ of 1.000 rests on 11 pairs; it was already rejected for a 22.9%
unparseable-reply rate and 3,669 completion tokens per call.

---

## 4. Cost facts, measured — none of this is a constraint

Reproduce any of it with `npm run cost -- --model=<id> --completion=measured` (free, no network).

**Generator, `firestore-direct`, warm:**

| | per answer | 12 mo @ 10k/mo |
|---|---:|---:|
| `gpt-oss-20b` | $0.000612 | $73.41 |
| `gpt-oss-120b` | $0.000625 | $74.95 |

**+2.1%, +$1.54/year.** The upgrade is effectively free.

**The finding that matters more than the model choice:** the two rate cards cross at **~697
completion tokens**. Below that, 120b is *cheaper* (at 400 tokens: $0.000421 vs $0.000618). The
measured mean is 740 — six percent past the crossover. `max_tokens` moves this number more than
the model does, and shorter answers independently help groundedness.

**Judge cost is input-dominated** — the prompt dwarfs the completion on every dimension, so the
input rate decides a judge's bill. Always run `npm run judge -- --dry-run` first. Sized properly
in §4a.

**Two caveats that would invalidate the generator figures.** Completion length is assumed to carry
from 20b to 120b and will not — 120b has its own reasoning budget, and break-even sits only 6%
below the assumed length. Cache hit rate is likewise assumed to carry; cold (`--cache-rate=0`),
120b is 2.1× worse. **One real capture at ~$0.02–0.05 resolves both** and simultaneously gives the
first honest read on whether 120b moves the 53% ungrounded number. Do that early.

---

## 4a. Judge volume and cost — sized 2026-08-31

Per-call means measured over `data/results/judge/warm.jsonl` (482 calls, 198 turns), not estimated:

| dimension | calls/turn | prompt | completion |
|---|---:|---:|---:|
| correctness | 1.00 | 4,939 | 503 |
| ungrounded | 1.00 | **11,648** | 940 |
| citations | 0.43 | 11,447 | 681 |
| **total per turn** | **2.43** | **21,555** | **1,739** |

Wave 1 is six passes — gold-context 120b, the 20b comparison, and four retrieval arms (pgvector is
dropped, §1). 528 turns, ~1,285 calls, 11.4M prompt tokens.

| scope | calls | deepseek-v4 | Gemini 2.5 Flash | gpt-oss-120b |
|---|---:|---:|---:|---:|
| one 88-turn pass | 214 | $0.52 | $0.95 | $0.38 |
| wave 1 — 6 passes | 1,285 | **$3.11** | $5.71 | $2.26 |
| wave 1 + one full redo | 2,570 | $6.22 | $11.42 | $4.52 |
| + wave 2, whole project | 4,498 | **$10.88** | $19.98 | $7.90 |

**Cost does not constrain any judge decision.** The spread between the cheapest and the most
expensive credible option, across the entire project, is about $12.

**§2a is a bigger cost lever than the model choice.** Moving groundedness into Tier 1 removes the
11,648-token `ungrounded` call — 54% of all prompt tokens:

| after 2a | calls/turn | wave 1 (deepseek) | whole project |
|---|---:|---:|---:|
| drop `ungrounded` | 1.43 | $1.43 | $5.00 |
| correctness only | 1.00 | $0.75 | $2.62 |

That is a 4x reduction on top of an already trivial bill, which is not the reason to do 2a — the
reason is that the instrument cannot currently read as fine as the 2% threshold requires — but it
does mean there is no cost argument for keeping groundedness in the paid tier.

---

## 5. The plan

> **Every phase ends with a STOP.** Do not roll into the next phase. Hand back to the user with
> the block written under that phase — what you did, what it cost, what they must decide or do,
> and the exact commands if any are theirs to run. The user runs all git; several phases need
> hours of their time. Surprising them with work they did not know was coming is the main way
> this plan fails.

### Phase 0 — Lock the slate (sequential, main thread, no agents) — ✅ **COMPLETE 2026-09-01**

1. **Settle the uncommitted work.** `src/eval/judge/{prompts,runner}.ts` and `src/eval/prices.ts`
   carry the `response_format: json_schema` enforcement plus two judge price entries. This is
   good work and should land — it is a prerequisite for a trustworthy judge. Also uncommitted and
   of unknown authorship: `docs/migration/DEVICE_API.md`. `.env.example.tmp` is an empty stray;
   delete it.
2. **Finish the judge-model comparison.** Four ledgers sit in `data/results/judge/` from
   2026-08-28 — `warm.schema-{120b,minimax,deepseek,nemotron}.jsonl` (83/83/82/50 rows).
   `nemotron` was rejected and committed; **minimax and deepseek were never concluded.** Computing
   cross-model agreement from these is free — no API calls — and it is the evidence that picks the
   judge. Do this before choosing.
3. **Freeze chunking.** Record size, overlap, and filter rules explicitly in this file. Chunk ids
   are content-derived SHA-256; **changing any of these voids every label.** Adding documents later
   is safe and does not perturb existing chunks — only re-chunking does.
4. **Archive the old eval artifacts** the way the docs were archived: tag, then delete from the
   tree, then leave a row in `docs/ARCHIVED.md`. Covers `eval/fixtures/`, `eval/fixtures-next/`,
   `eval/retrieval-labels/`, `eval/transcripts/`, `eval/grading/`. Nothing is lost — every one is
   committed and retrievable via `git show <tag>:<path>`.

   **Done 2026-09-01** under the tag **`eval-archive-2026-09-01`** (pointing at `92438f3`, the last
   commit containing them): 556 files, ~20MB. `docs/ARCHIVED.md` carries the per-directory table and
   the warning that `--calibrate` is broken until Phase 2c. The directory *names* were left free —
   new captures, packets and labels land back at `eval/transcripts/`, `eval/grading/` and
   `eval/retrieval-labels/`, so none of those constants moved. `FIXTURE_DIR` points at
   `eval/fixtures-wave1/`; renaming it back to `eval/fixtures/` is the last step of the migration.

> ### → STOP. Hand back to the user with:
>
> 1. **The judge-model comparison result** — pairwise agreement between the four ledgers, and a
>    recommendation. This is free evidence and it picks the instrument for everything downstream.
>    **Ask them to confirm the judge**, and flag that it must not be Claude (fixture author) or
>    gpt-oss (generator).
> 2. **A git plan** covering exactly what is uncommitted at that moment — derived from a fresh
>    `git status --short`, `git log --oneline -3` and `git status -sb`, never from memory. They run
>    it. Include the archive tag creation.
> 3. **The chunking parameters you are freezing**, stated explicitly (currently 3,200 chars /
>    400 overlap / alpha-ratio filter skipped for `.md`/`.txt`). Default is to keep them as-is —
>    say so and ask only for a yes. Note that after this, adding documents stays safe forever;
>    only re-chunking is destructive.
> Nothing here costs money. Do not proceed to Phase 1 until the judge is confirmed.

### Phase 1 — Build the new eval set

**1a. Claim inventory (agents — parallel by document).** Sweep the corpus and extract, per chunk,
*what claims that chunk supports* — **not questions**. This produces the map of what the corpus can
actually answer, which drives the class quotas and reveals the gaps that refusal fixtures are built
from. Parallelize across the 15 documents; each agent owns a disjoint set of files and writes to
its own output path.

**1b. Question generation (agents — parallel by class).** Generate questions from *claims*, against
the class quota in §2. Single-hop classes draw on one claim; `cross-document` draws claims from
different files; `precedence` needs a conflict between operator range and document; `refusal` comes
from the inventory's gaps. **One agent per class, disjoint outputs.**

**1c. Decontaminate — do not skip this.** A question generated from a chunk inherits that chunk's
vocabulary, so the query embedding sits next to the gold chunk *by construction*, and retrieval
recall becomes meaningless. Rewrite each question in an operator's voice **without the source chunk
visible**. Then verify: run BM25 over the finished questions; **if the gold chunk returns at rank 1
nearly every time, the set is contaminated** and any retrieval number from it is decoration.
`src/retrieval/lexical/Bm25Index.ts` already exists.

**1d. Human verification (user, not an agent).** The user confirms each question is answerable from
its claimed source. Note this checks the *label*, not whether the question is a good retrieval test
— 1c covers that.

**1e. Label separately.** Do **not** assume "source chunk = the only relevant chunk." With 400-char
overlap and 15 documents covering six overlapping metrics, other chunks will also be relevant, and
labelling only the source produces false negatives in ground truth. Run a separate pass over
candidates. Store a **human locator** (document + section + short quote) alongside each chunk hash,
so a future re-chunk can re-resolve labels instead of voiding them.

Also salt in **hard negatives** — chunks that look relevant and are not (the wrong probe's
datasheet, the right metric in the wrong water type). These test discrimination rather than match.

> ### → STOP after 1a. Hand back to the user with:
>
> The claim inventory, summarized per document: how many claims each yielded, which of the six
> metrics each covers, and — most important — **the gaps**. Ask them to spot-check two or three
> documents they know well. This is the cheapest possible moment to catch a document being
> misread, and the inventory drives every quota downstream.
>
> Flag explicitly: **can the corpus support 25% of turns answerable only outside the ◆G9 slice?**
> If not, say so now. That is exit criterion 3 and it is better discovered here than after 40
> fixtures are written.

> ### → STOP after 1b–1c. Hand back to the user with:
>
> 1. **The BM25 contamination number** before anything else — % of questions returning their gold
>    chunk at rank 1, against the < 40% bar. If it fails, do not hand them fixtures to review;
>    fix 1c and re-run first. Their review time is the scarce resource and it must not be spent
>    on a set you already know is contaminated.
> 2. **The ~40 fixtures for human verification** — this is the user's 4–6 hours, so make it
>    reviewable: one fixture per screen, question + claimed source passage + rubric side by side,
>    and a clear yes/no/fix action per row. Tell them roughly how long it will take.
> 3. **The per-class counts** against the §2 quota, so they can see the allocation before
>    committing time to it.

> ### → STOP after 1d–1e. Hand back to the user with:
>
> The label set for confirmation, focusing on the **multi-chunk** labels — those are where false
> negatives hide, and a missed relevant chunk silently scores retrieval as a miss forever after.
> Report how many questions ended up with 1, 2, 3+ labelled chunks, and show a sample of the
> multi-chunk ones. Also report how many hard negatives were placed and where.
>
> Then a git plan: the new fixtures and labels are the first durable artifact of the rebuild and
> should land before anything is captured against them.

### Phase 2 — Rebuild the instruments

**2a. Quote-based citations → Tier 1.** Have the generator attach a short **verbatim quote** to each
claim instead of predicting a line number. A quote is checkable by normalized substring match,
which moves groundedness out of the paid, unreliable Tier 2 into free deterministic Tier 1. This is
the highest-leverage item in the whole plan: the 2% ungrounded ceiling is ≈1 turn of 58, and the
judge dimension currently measuring it flips **11 of 36 verdicts** on byte-identical prompts. *The
instrument cannot read as fine as the threshold requires.* `checkQuotes` already exists in
`src/eval/gates/checks.ts` and currently measures 0 quoted citations on every arm, because the model
has never been asked to emit one.

**2b. Repoint the judge** to the cross-family model chosen in Phase 0. — ✅ **DONE 2026-09-02.**
`DEFAULT_JUDGE_MODEL` is `accounts/fireworks/models/deepseek-v4-flash-0731`. It had still been
`gpt-oss-120b`, which had meanwhile become the *production generator* (§1), so the default judge
was set to grade its own output and nothing in the suite objected. `test/unit/judge.test.ts` now
asserts `judgesOwnFamily(DEFAULT_JUDGE_MODEL, PRODUCTION_GENERATOR) === false`, and that the
shipped judge carries a `CHAT_PRICES` entry so the budget line cannot print blank. No API calls
were made and nothing was spent.

**2c. Re-calibrate** against the human-graded sample. Rows must be **stratified across classes and
arms**, not concentrated — the previous 24 rows sat on 6 fixtures and scored 1.50/2 where the full
58 scored 1.08. Calibrate correctness only; do not spend human hours calibrating the list-producing
dimensions, replace them (2a).

> ### → STOP after 2a–2b, before asking for grading. Hand back to the user with:
>
> 1. **The quote-citation Tier 1 check, working** — demonstrate it on a handful of answers and
>    report the quoted-citation rate. It reads 0 on every existing arm because the model has never
>    been asked to emit a quote; a non-zero number here is the proof the lever is connected.
> 2. **A prompt diff**, since 2a changes the system prompt. Note plainly that this invalidates any
>    capture made before it — which is fine, because the old captures are already dead.
> 3. **The judge repointed**, with `npm run judge -- --dry-run` output showing what a real pass
>    would cost. **Ask before spending it.**

> ### → STOP after 2c. Hand back to the user with:
>
> **The 30 calibration rows to hand-grade** — their second block of time, ~1.5–2 hours. Point them
> at `docs/GRADING_GUIDE.md`, tell them **not to open `KEY.json`**, and use `--out=<dir>`, never
> `--force` (that flag destroyed 36 completed rows once).
>
> When they return the grades, compute κ and report it against the **≥ 0.70** bar in §2. This is
> exit criterion 2 and it decides whether the judge can be trusted for everything after.

### Phase 3 — Generation baseline, at the ceiling

Capture `gpt-oss-120b` against **gold context** — the labelled-relevant chunks fed directly, no
retrieval. This isolates generation completely and answers the question that governs everything
downstream: *if the model cannot clear 1.30 on perfect context, no retrieval strategy will save it.*

Single model — `gpt-oss-120b` is settled as the production generator (§1), so this is one baseline,
not a sweep. Capture the **real completion-token mean** while you are here: it re-baselines the cost
model (the 20b/120b comparison inverts at ~697 tokens, §4) and it is an input to the `max_tokens`
lever, which is the cheapest remaining generation knob.

> ### → STOP. This is the most important handback in the plan. Give the user:
>
> 1. **Correctness and ungrounded rate on gold context, against the 1.30 and 2% bars.** State
>    plainly which of three worlds you are in:
>    - **Clears both** — generation is fine, and every remaining problem is retrieval. Proceed to
>      Phase 4 with a real ceiling to measure against.
>    - **Clears neither** — retrieval cannot help, and the levers are prompt, `max_tokens`, model.
>      Two are already spent. Say so directly; that is a finding worth more than a workaround.
>    - **In between** — quantify the gap and name which lever you would pull, with a cost.
> 2. **The 20b → 120b delta on the same fixtures**, if a 20b baseline is cheap to run. This is the
>    first real evidence on whether the model upgrade fixes groundedness on its own, and it costs
>    one extra capture.
> 3. **The measured completion mean**, and what it does to the §4 cost table.
> 4. **All five wave-1 exit criteria from §2, checked and reported.** Recommend wave 2 or a fix,
>    and say which.
>
> Costs money — a capture plus a judge pass. **Get approval before running it.**

### Phase 4 — Retrieval, measured against that ceiling

Only now. The question becomes: **how close to gold-context quality does each real retrieval arm
get?** That is a clean, answerable question, and it is the one the previous bake-off could not ask.

Note that the previous retrieval conclusions are **not** inherited. `firestore-direct` won on
evidence from a placeholder model, a confounded generator and a fixture mix that was 90%
slice-answerable. Treat every arm as unranked at the start of this phase.

> ### → STOP. Hand back to the user with:
>
> 1. **Each arm's gap from the gold-context ceiling**, per class. This is the retrieval result,
>    stated the way it should have been stated the first time.
> 2. **A recommendation with its reversal condition** — what would have to be true for this to be
>    the wrong call. The previous decision lacked this and it is why it did not survive scrutiny.
> 3. **Whether the ◆G7 retrieval decision should be re-opened and re-closed** on this evidence,
>    and the `timeline.md` entry that would record it.
> 4. **A git plan** for the results, and a proposal for folding this file into a permanent
>    `docs/EVALUATION.md` — the Phase 2 doc consolidation that was deliberately deferred until the
>    method existed.

---

## 6. Traps — every one of these cost real time

**Carried forward, still live:**

- **The 20.2% recall floor.** `stub` scores 20.2% while retrieving nothing that exists in the
  corpus, because 20 of 99 labelled queries are `noRelevantChunks` and correctly retrieving nothing
  scores 1. **Report recall on answerable turns as the headline** and keep no-answer turns as a
  separate refusal-precision metric — that kills this confusion permanently instead of documenting
  around it.
- **Unicode breaks exact matching.** The model emits U+2011 where `REFUSAL_SENTENCE` has U+002D, and
  NFKC folds U+2011 to U+2010, **not** to U+002D. Use `normalizeForMatch` in
  `src/eval/gates/normalize.ts` for any string comparison.
- **Grounding is wider than the retrieval context.** The system prompt carries operator ranges and
  the question may supply figures. A transcript's `context` field is retrieval context ONLY.
  Treating it as the whole grounding produced ~24 false "fabricated figure" findings per arm.
- **`SENSOR_TOOL=false` must be set on BOTH the server AND the runner.** Server-only yields the
  wrong fixture count and junk answers.
- **Re-chunking invalidates every label.** Chunk ids are content-derived.
- **`npm run grade:packet` re-labels every answer when the arm set changes.** Use `--out=<dir>`,
  never `--force`. It destroyed 36 completed grading rows once.
- **A grading packet is pinned to its transcripts.** Re-capturing an arm silently invalidates every
  human row for it. This once **inverted the sign of a published result** — a fix looked like a
  regression (κ 0.87→0.83) when scored over stale rows, and was an improvement (0.81→**0.94**) over
  comparable ones. `--calibrate` now detects and excludes outgrown rows.
- **The calibration subset was optimistic.** A subset calibrates the judge; it does not produce a
  result.
- **`Date.now()` is not a clock for elapsed time.** Civil time; the OS steps it backwards. Fixed to
  `performance.now()` in `src/eval/transport.ts`, **not retroactively** — old transcripts remain
  unusable for latency.
- **`npm run typecheck` covers only `src/**`.** `scripts/` and `test/` are not typechecked; exercise
  them by running them.
- **The judge's list-producing dimensions do not reproduce.** Never rest an argument on per-arm
  *differences* in the groundedness column.
- **Adding a rule to a judge prompt is not free where it does not apply.** An unconditional refusal
  rule changed verdicts on unrelated turns.
- **`npm run cost` holds completion length constant by design.** Use `--completion=measured` to
  reproduce published figures.

**New, from the rebuild design:**

- **Chunk-derived questions are contaminated** (Phase 1c). This is the single easiest way to build
  an eval that reports excellent numbers and measures nothing.
- **A judge call is input-dominated.** ~420K prompt against ~42K completion over 83 calls.
- **Cache hit rate does not carry across models.** 99.0% is a measurement of 20b, not a property of
  the prompt.
- **The 120b/20b cost comparison inverts at ~697 completion tokens.**

---

## 7. Commands

```
npm run gate:check                      # Tier 1. Free, deterministic, seconds. Run constantly.
npm run retrieval:eval                  # offline retrieval diagnostics, ~10s, free
npm run cost                            # sweep completion length across arms
npm run cost -- --model=<id> --completion=measured
npm run judge -- --dry-run              # what a pass would cost, without spending
npm run judge -- --calibrate            # judge-vs-human agreement, no API calls
npm run judge -- --report               # summarize the ledger, no API calls
npm run ingest                          # documents/ -> data/corpus/corpus.json
npm run embed:cache                     # incremental
```

**Three of those throw right now, by design** — the archive emptied what they read, and each
refills at a named phase. A clear "nothing captured yet" error is the correct output; the
alternative was `gate:check` grading `gpt-oss-20b` transcripts and printing a PASS/FAIL that
means nothing for the new set.

| command | state as of 2026-09-02 | refilled by |
|---|---|---|
| `npm run gate:check` | `No transcripts at .../eval/transcripts/warm.` | Phase 3 |
| `npm run judge -- --calibrate` | same message — it builds the task list before reading grades | Phase 3, then 2c |
| `npm run retrieval:eval` | `No retrieval labels at .../eval/retrieval-labels.` | Phase 1e |

`npm run cost`, `npm run ingest` and `npm run embed:cache` are unaffected.

**Capturing an arm** (~$0.02–0.05). The user often runs a server on port 8000 with different env —
**use another port, do not kill it.**

```
PORT=8010 SENSOR_TOOL=false REPORT_TOOL=false DEBUG_RETRIEVAL=true \
  CORPUS_SOURCE=firestore DEFAULT_RETRIEVAL=firestore-direct LLM_MAX_TOKENS=16384 \
  npx ts-node src/index.ts

SENSOR_TOOL=false REPORT_TOOL=false DEBUG_RETRIEVAL=true CORPUS_SOURCE=firestore \
  npm run bakeoff -- --arm=<arm> --pass=warm --base-url=http://localhost:8010/api/v1 --spot-check
```

`--spot-check` first, always. An adapter returning empty context produces a clean-looking and
completely meaningless dataset.

---

## 8. House rules — these bind, see `CLAUDE.md`

- **The user runs every git command.** Do not commit, push, branch, or tag unless explicitly
  authorized in the conversation.
- **Never run the full test suite.** Target specific suites and say which you ran.
- `npm run typecheck` and `npx eslint src --ext .ts` are cheap — use `npx eslint`, not
  `npm run lint` (that script writes files).
- **Pass both rules to any agent you dispatch.**
- Write only inside this repository. `../user-dashboard` and `../backend` are read-only references.
- **Ask before spending.** Captures and judge passes cost real money.

---

## 9. Repo state (2026-09-02)

- Branch `dev`, level with `origin/dev`. Working tree clean.
- Corpus: **15 documents, 851,891 chars, 451 chunks** (re-ingested 2026-08-31 without the
  alpha-ratio filter; was 393). ◆G9 slice is 37,660 chars (4.4%).
- Fixture set: **46 fixtures / 92 turns** in `eval/fixtures-wave1/`, seven classes, all runnable
  (no fixture declares a `requires`). Slice coverage 41 none / 5 partial / 0 full.
- Tags: `docs-archive-2026-08-30` (six archived docs), **`eval-archive-2026-09-01`** (the whole
  pre-rebuild eval set, 556 files), `wip-merge-chain-fanout-2026-08-31`,
  `wip-restore-pgvector-2026-08-31` (an arm the project has decided against — §1, do not pursue).
- Full test suite: **46 suites / 949 tests, green, zero skipped** (2026-09-02).

### Phase status

| phase | state |
|---|---|
| 0 — lock the slate | ✅ complete 2026-09-01 |
| 1a — claim inventory | ✅ 2,250 claims, 1,685 high-specificity, 168 gaps, 451/451 chunks |
| 1b — question generation | ✅ 46 fixtures / 92 turns |
| 1c — decontaminate | ✅ 22.8% document-level, 11.6% chunk-level, against the < 40% bar — **exit criterion 1 passes**. `eval/fixtures-wave1/_CONTAMINATION.md` |
| 1d — human verification | ⬜ **the user's, ~4–6 h.** Do not start before the fixture text is frozen |
| 1e — labels + hard negatives | ⬜ refills `eval/retrieval-labels/` |
| 2a — quote-based citations | ⬜ **the highest-leverage item in the plan.** Unblocked: the pinned-prompt digest that would have fought it was removed 2026-09-02 |
| 2b — repoint the judge | ✅ done 2026-09-02 |
| 2c — re-calibrate | ⬜ needs captured answers to grade — see the sequencing note below |
| 3 — generation baseline | ⬜ costs money, needs approval |
| 4 — retrieval | ⬜ |

**Sequencing — SETTLED 2026-09-09: Phase 3 runs before 2c.** 2c grades 30 stratified rows, and
grading needs captured answers that only Phase 3 produces. One capture (~$0.02–0.05) therefore
serves both the generation baseline and the calibration rows. The numbering is inverted and stays
that way; read the phases in the order 0, 1, 2a, 2b, **3, 2c**, 4.

### Known blocker — the refusal gate reads zero on this set

`gates/runner.ts` decides "this turn must refuse" by regex-matching rubric prose for
`\brefus(e|es|al|ing)\b`. The archived set wrote *"refuses to answer"*; wave 1 writes
*"Declines to…"* and *"States that no source here gives…"*, so the pattern matches **0 of wave 1's
8 refusal turns** where it matched 3 of the archived set's 6.

Left unguarded, `gate:check` would report `required: 0, met: true` at Phase 3 — a clean pass on an
absolute pre-registered gate that measured nothing. `refusalMap()` therefore **throws** when
refusal-class fixtures load and no turn is detected.

Widening the pattern is not the fix: adding `declines` catches only 3 of 8 and picks up two false
positives in the archived set. **The fix is a per-turn `requires_refusal` boolean on the fixture**,
which `EVAL_FIXTURES.md` §7 previously ruled out because the fixtures were a pinned control while
◆G7 was open — a reason that no longer exists. This blocks Phase 3.
