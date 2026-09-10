# Advice catalogue — candidate entries for operator approval

Draft entries for the operator-approved advice allowlist decided in
[`../RESPONSIBILITY.md`](../RESPONSIBILITY.md). **Nothing here is shipped copy.** Each entry is a
proposal for a human to approve, edit or reject, and the catalogue only reaches the model once
someone has signed off on it.

The design these are drafted against: code selects entries by matching a detected event; the model
only phrases what it is handed; a Tier 1 check can then assert that every suggestion in an answer
maps to an approved entry. The corpus does not change for this feature.

| file | scope | candidates | rejected |
|---|---|---:|---:|
| [`candidates-oxygen.md`](candidates-oxygen.md) | `Hypoxia`, `Algal bloom` | 8 | 9 |
| [`candidates-discharge.md`](candidates-discharge.md) | `Sewage`, `Stormwater`, `Industrial`, `Acidic input` | 9 | 9 |
| [`candidates-regime.md`](candidates-regime.md) | `Thermal`, `Saltwater intrusion` | 9 | 6 |
| [`candidates-instrument.md`](candidates-instrument.md) | fouling, drift, calibration, implausible readings, silent pods | 12 | 7 |

**Read the rejected lists.** They are where the boundary is visible, and they are the strongest
evidence that the catalogue is a controlled surface rather than a model improvising within
guardrails. Three worth knowing: a hypoxia DIY entry recommending an aerator was rejected because
aeration installed at the wrong time of year can *induce* hypoxia; a sewage grab-sample entry was
rejected because directing someone toward contact with water carrying a sewage-consistent signature
is an exposure the device cannot assess; and a recalibrate-on-pH-drift entry was rejected because
the ±0.3 pH figure it leaned on is the EPA SOP's bench-check default *when a project plan is
silent*, not a live-deployment tolerance.

## Trigger reachability — read before approving

Several entries are keyed to event types the pipeline **cannot currently produce on live data**.
The entries are still worth approving, since approval is cheap and each gap is a fixable code
defect — but a first release should not depend on them.

| event type | live-data status |
|---|---|
| `Sewage`, `Hypoxia`, `Acidic input`, `Stormwater` | reachable |
| `Thermal` | reachable on the full signature only; the temperature-alone branch is downgraded |
| `Industrial` | **unreachable** — classified at confidence 0.3, below the 0.5 floor, always rewritten to `Inconclusive` |
| `Saltwater intrusion` | **unreachable** — classified at 0.45, same cause |
| `Algal bloom` | **unreachable** — `detectAlgalBloom` requires a `diel` pattern tag, and live data is always tagged `unknown` |
| instrument-health triggers | reachable, except three entries keyed to detectors that exist in the type system but are never computed |

## Three defects this exercise surfaced

Found while drafting, verified in code, none fixed:

1. **`detectAlgalBloom` bypasses the confidence-floor downgrade.** Every other event type below
   `CONFIDENCE_FLOOR` is rewritten to `Inconclusive`; the bloom detector returns `"Algal bloom"` at
   confidence 0.45 directly. It cannot fire on live data today for the separate reason above, but
   the asymmetry is live in any hand-built input — and it applies to the single most
   liability-exposed label in the system.
2. **Two event types are dead** (`Industrial`, `Saltwater intrusion`), classified below a floor they
   can never clear. Either the signatures deserve higher confidence, or these conditions are only
   honestly reportable as `Inconclusive` — in which case the catalogue wants one `Inconclusive`
   entry rather than per-type entries for them.
3. **No diel/tidal classifier exists.** `buildReportInput` tags every live parameter `unknown`. This
   disables the bloom detector *and* disables the protection that stops a normal daily swing from
   opening an event window at every baseline crossing. One missing component, two opposite failure
   modes.

There is also no `Pattern` value for a slow multi-week trend, which is what drought-driven salinity
creep looks like — such a case matches neither the diel/tidal exclusion nor the persistent-offset
rule, and surfaces with no natural-cause framing.

## What approval means

Approving an entry means: the wording is defensible as written, the tier is right (`education`
explains, `escalation` names who to involve, `diy-hints` proposes a low-risk reversible action the
operator can take themselves), and Clean Earth Rovers is willing to stand behind it appearing
verbatim in a customer-facing answer.

Sourcing candidates listed in the individual files are **not** part of this approval. They are
possible future corpus additions, unverified against the sourcing protocol, recorded so they are not
lost.
