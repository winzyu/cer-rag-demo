# Scope

WRITE: only within this repository (cer-demo).
READ-ONLY: ../user-dashboard and ../backend are reference repos.
Never create, edit, or delete files outside cer-demo. If a task seems to
require modifying a reference repo, stop and tell me instead.

All migration planning artifacts go in docs/migration/.

# Docs

docs/ holds current state only. Superseded session handoffs and the reference-repo
convention docs are **not in the tree** — they live in git history under the tag
`docs-archive-2026-08-30`. docs/ARCHIVED.md lists what moved and why.

Never grep for, read, or cite an archived doc unprompted. If a question seems to
need one, ask me first — usually the archived doc is stale and a current doc
already answers it. Retrieve with `git show <tag>:<path>`, never by restoring the
file to the tree.

docs/HANDOFF_2026-08-27.md is the current handoff. Do not treat any other
handoff as current.

# Delegation

This project runs an Opus orchestrator with Sonnet subagents. Five rules, each
of them a failure this pattern actually produces.

- **Delegate implementation.** File edits, test writing, mechanical refactors and
  scoped features go to a Sonnet subagent. Write code directly only when the task
  needs cross-cutting judgment — retrieval strategy, eval methodology, prompt or
  gate design, anything spanning `src/`, `eval/` and `docs/` at once. Left
  unguided the orchestrator writes the code itself, which costs Opus rates for
  Sonnet work.
- **Verify the routing, do not assume it.** `model: sonnet` in agent frontmatter
  and the equivalent env var have both been silently ignored, running everything
  on the parent model. Check the usage dashboard or token cost after the first
  delegation of a session; if it did not route, stop delegating and say so.
- **Brief each subagent as if it just walked in, because it did.** It inherits
  none of this conversation — only the prompt text. Carry into every task prompt:
  the conventions and naming already in force, the decisions already settled (and
  that they are not to be relitigated), the relevant traps, the exact files to
  touch, and the house rules below. Point at the docs by name. A subagent
  producing code that does not fit the rest of the repo is an under-specified
  brief, not a bad agent.
- **Review subagent output before treating it as done.** Read the actual diff,
  not the agent's summary of it. Mandatory for anything touching retrieval
  accuracy, numeric data handling, gate logic or judge logic — a
  plausible-but-wrong implementation there is the real risk and it does not
  announce itself.
- **Delegation is one level deep.** Subagents do not spawn subagents; all
  coordination flows back through the orchestrator.

# Testing

Run only the tests relevant to what you changed. Never run the full suite — it is
slow and burns tokens I would rather spend elsewhere. I run `npm test` myself and
will report anything that breaks.

- Target the specific suites: `npx jest test/unit/foo.test.ts`, or `npx jest -t
  "<name>"` for a single case. Pick them by what you touched, and say which ones
  you ran.
- `npm run typecheck` and `npx eslint src --ext .ts` are cheap — run them freely.
  (Use `npx eslint`, not `npm run lint`; the script runs `--fix` and writes files.)
- This applies to subagents too. If you delegate, pass the rule along.
- In a git plan's **Verification** line, report exactly the suites you ran and say
  plainly that the full suite was not run. Do not claim green tests you did not run.

# Git

**Never run a git command until I have confirmed the plan for it.**

The sequence is always: you show me the plan, I confirm it, and my confirmation
says who runs it — I run it myself, or I tell you to run it. Both are normal.
Until that confirmation arrives, run nothing: no commit, push, branch, tag,
stash, or checkout.

When I tell you to run it, run exactly the commands in the plan I approved —
not a variation, not an extra step, and nothing the plan did not list. If you
discover partway through that the plan was wrong, stop and show me a new one.

After every checkpoint of functionality you reach **and verify** — a feature or
partial feature that can be tested and that you have briefly tested — give me a
**git plan**:

- The exact commands to run, in order.
- What each command does.
- A brief reason why we should run it.
- Any human instructions or cautions I need in order to run them manually
  (secrets to keep untracked, things to check first, cleanup to do later).

Do not hand me a git plan for unverified work. If something is untested or
failing, say so plainly instead — including pre-existing failures you did not
introduce.

**Every git plan covers only what is uncommitted right now — nothing else.**

- Run `git status --short`, `git log --oneline -3`, and `git status -sb`
  immediately before writing the plan. Derive it from that output, never from
  what you remember proposing earlier in the session.
- I may have already run an earlier plan. Assume I did. Never re-list commits
  that already landed, and never re-create a branch that already exists.
- One checkpoint, one plan. Do not accumulate a session-long list of commits.
- Name the actual paths from `git status`, not the ones you expected to see. If
  a file you wrote is missing from the output, say so — it likely means I already
  committed it, or it did not get written.
- If nothing is uncommitted, say exactly that instead of producing a plan.

Open every git plan with a short state header, so I know where I am before I run
anything:

- **Branch** I am on now, and whether it has an upstream / is ahead or behind.
- **Target** — the branch this work is meant to land on, and whether a new branch
  is needed or the current one is already correct.
- **Verification** — the result of the checks you ran (tests, lint, typecheck),
  including anything failing or pre-existing.
- **Uncommitted paths**, and a flag on anything in the working tree that is *not*
  part of this checkpoint.
- Anything genuinely relevant and out of the ordinary: a secret at risk, a
  generated or large file, a deletion, a dependency or lockfile change, a
  migration that must land with its code.

Keep the header to a few lines. It is orientation, not a report.

# Commit messages

Keep them short: a one-line subject, and at most a few lines of body. The subject
says what changed, not why.

Do not put architectural decisions, rationale, or design notes in commit messages.
Record those in the relevant markdown file instead — usually `docs/SPECS.md` for
how the built system works, `docs/timeline.md` for phase/gate decisions, or the
design doc for that piece of work. Commit messages point at the change; the docs
carry the reasoning.
