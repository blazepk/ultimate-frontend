## What this stage built

`@harness/experiment` went from an empty stub to the orchestrator that runs a
complete experiment end to end: it takes a pending `Proposal`, builds the
baseline and the mutated variant into separate `dist/` trees, serves both,
collects `n_per_arm` samples from each arm against the target route, hands
them to `@harness/engine`'s `decide()`, and persists the result, the raw
samples, and the updated proposal at their frozen `runs/` paths. This is the
first component that exercises the whole pipeline in one call — config
through build through browser measurement through statistical verdict.

## Decisions made during implementation

**Decision:** the variant arm is measured against the **variant's** resolved
route (`variantProfile.routes`), and `decide()` receives the **variant's**
budgets — not the baseline route's.
**Alternatives rejected:** Passing the baseline route to both `collectMany`
calls is simpler and reads fine, but it would measure the variant under the
baseline's tier, budgets, and island set. A proposal that changes
`render_mode` or `data_strategy` changes the route object itself; collecting
the variant's samples against the stale baseline route would silently
mismatch a11y expectations (the a11y check reads island contracts and props
from the route it is handed) and would judge the variant against budgets it
did not propose.
**Revisit when:** CONTRACTS §12 is amended to state explicitly which arm's
budgets gate the veto — it currently says only "the target route's resolved
budgets" without disambiguating between the two arms' versions of that route.

**Decision:** the proposal is persisted with status `"testing"` **before**
measurement begins, then overwritten with the terminal status afterward.
**Alternatives rejected:** Writing only once at the end (with the terminal
status) is one fewer file write and avoids a transient state on disk. But
CONTRACTS §10 specifies a three-state machine — `pending → testing →
terminal` — and a `"testing"` state that never appears anywhere is not
really implemented. Writing it also means a crash or kill mid-measurement
leaves an accurate `"testing"` marker on disk instead of a stale
`"pending"`, which is the difference between "this experiment was
interrupted" and "this experiment never started".
**Revisit when:** experiments become resumable, at which point the
`"testing"` record needs to carry enough context (experiment_id, arm
progress) to actually resume from — today it carries none.

**Decision:** `runExperiment` throws if the incoming proposal's status is
anything other than `"pending"`.
**Alternatives rejected:** Silently re-running any proposal is more
permissive and would never block a caller. But CONTRACTS §10 says terminal
states have no transitions, and re-running a decided proposal would
overwrite its recorded outcome with a fresh one — destroying the evidence
the KB was built from, with no error to notice. Enforcing the frozen state
machine is implementing it, not adding to it.
**Revisit when:** a legitimate re-run workflow appears (e.g. re-testing after
an environment change), which would need its own explicit entry point rather
than relaxing this guard.

**Decision:** both arms are served simultaneously on adjacent ports, with the
port walked upward from `SERVE_PORT_BASE` until one binds.
**Alternatives rejected:** Serving one arm, collecting, closing, then serving
the other reuses a single port and is marginally simpler. Both were
acceptable — the collection order is sequential either way — but binding both
up front fails fast if either dist is unservable, rather than discovering it
halfway through an experiment that has already spent minutes collecting the
first arm. Hard-coding port 4600 without a fallback was rejected because
CONTRACTS §1.4 calls it "the **first** port tried", and a leftover server or
a concurrent run would otherwise abort the experiment for an incidental
reason.
**Revisit when:** experiments need to run concurrently on one machine —
today the upward walk prevents collisions, but nothing coordinates two
runners that might interleave their measurements and contaminate each
other's timing.

## Load-bearing assumptions

- **Measurement conditions are stable across the whole run.** All `n_per_arm`
  baseline samples are collected first, then all variant samples
  (`collectMany` per arm, sequentially). Any drift over the run — thermal
  throttling as the machine heats up, a background process starting, CPU
  frequency scaling — is therefore **perfectly confounded with the arm**.
  **Failure mode:** a machine that slows down during the run makes the
  variant look systematically worse (and vice versa), producing a confident
  `reject` or `accept` that is entirely an artifact of collection order.
  Interleaving the arms (baseline, variant, baseline, variant, …) would
  break the confound; CONTRACTS §12's "collectMany per arm" wording is what
  produces the block design instead. This is the single largest threat to
  validity in the pipeline and nothing in the code can detect it.

- **The two builds are independent and neither perturbs the other.** Both
  arms are built before either is served, into separate `dist/<profile_id>/`
  trees. **Failure mode:** `build()` reads `islands/registry.json` and
  `islands/contracts.json` from the repo root (not from `work_dir`), so if
  anything mutates those files between the two builds, the arms are built
  against different island definitions and the comparison is meaningless
  while still producing a clean-looking result.

- **`decide()` receives arms of exactly equal length.** `runExperiment`
  passes the same `n_per_arm` to both `collectMany` calls, and `decide()`
  throws on a mismatch. **Failure mode:** none while both collections
  succeed — but `collectMany` has no partial-failure path today (a failed
  sample rejects the whole call), so a future change that makes it skip bad
  samples would silently produce unequal arms and hit `decide`'s throw at the
  very end of a long run, discarding all the work.

- **`experiment_id` uniqueness rests on a per-process counter.**
  `generateId` combines `Date.now()` with a counter that resets on process
  start. **Failure mode:** two runner processes started in the same
  millisecond would generate identical ids and the second would overwrite the
  first's `runs/experiments/` and `runs/samples/` files. Single-process
  operation is an explicit assumption of ADR-0012 (JSON-file persistence, no
  locking), so this is consistent with the frozen design rather than a new
  risk — but it is a real one if the loop is ever parallelized.

- **`work_dir` controls only where outputs go, never where inputs come
  from.** The fixtures, registry, and contracts are always read from the repo
  root. **Failure mode:** a caller passing a `work_dir` expecting a fully
  isolated sandbox gets isolated *outputs* but shared *inputs* — fine for the
  test suite (which is exactly why the test can use a temp dir), misleading
  for anyone assuming full isolation.

## How to tell if this is still correct

Run `npx playwright install chromium && pnpm --filter @harness/experiment typecheck && pnpm --filter @harness/experiment test && pnpm --filter @harness/experiment build`
from the repo root. Expect: typecheck emits nothing; test reports
`1 passed (1)` test file and `12 passed (12)` tests in roughly 25–30 seconds
(6 real browser samples at ~3.5s each plus two esbuild builds — a large
duration increase is itself a signal); build emits nothing.

The assertions that matter most are the two that catch silent orchestration
errors rather than crashes: the JSONL test asserts baseline samples carry
`baseline_profile_id` and variant samples carry `variant_profile_id` (a
swapped pair would still produce a plausible result), and the build-diff test
asserts the variant's emitted HTML actually contains
`data-hydration="visible"` where the baseline has `data-hydration="idle"` —
i.e. that the mutation was genuinely applied rather than the same build being
measured twice.

## Escalated

One entry appended to `docs/OPEN_QUESTIONS.md` (#16): `docs/PUBLIC_API.md`'s
`@harness/engine` "re-exports reward + experiment" cannot be implemented as
written, because `packages/experiment` imports `decide` from
`@harness/engine` (REWARD.md §8 freezes `decide` in the reward package), so
the re-export would close a dependency cycle. `prompts/stage-07.md` had
already scoped that wiring out of this stage; this stage supplies the
concrete reason it is not merely deferred but currently impossible, plus the
three shapes a fix could take. Left unwired; nothing today consumes
`@harness/engine` expecting `runExperiment` on it.

**Addendum (correction, 2026-07-27) — #16 resolved.** Not a design fork: the
three candidate shapes above all satisfied CONTRACTS.md equally, so the
choice needed a human ruling, which arrived as option (b). `@harness/engine`
(`packages/reward`) and `@harness/experiment` (`packages/experiment`) ship
as two separate public packages; there is no re-export in either direction.
`docs/PUBLIC_API.md`'s package table, exports map, and the
`packages/reward/` + `packages/experiment/` note were corrected to match,
and `packages/reward/src/index.ts` / `packages/experiment/src/index.ts` now
each carry a comment pointing back here and to `docs/OPEN_QUESTIONS.md` #16
(RESOLVED). No code outside those two index files changed — `packages/
experiment/src/run.ts` already imported `decide` from `@harness/engine`
directly rather than through the never-implemented re-export, so nothing
was "unwired" by this fix; the correction only brings the docs into
agreement with the dependency graph that already existed.
