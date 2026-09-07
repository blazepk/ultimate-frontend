## What this stage built

`@harness/engine` (directory `packages/reward`) went from a single partial
file to the complete reward and decision layer: `normalize()` maps each raw
metric onto a [0,1] score against REWARD.md's frozen thresholds;
`sampleReward()`/`armStats()` turn samples into a weighted scalar reward and
its arm statistics; `evaluateVetoes()` grew from the recovery-era V001-only
stub into the full five-veto safety gate; and `decide()` combines them into
the `ExperimentResult` that Stage 7 will persist. This is the component that
turns measurements into an accept/reject/veto/inconclusive judgment, so
every number it produces is load-bearing for what the harness does next.

## Decisions made during implementation

**Decision:** `roundHalfUp()` breaks ties away from zero (Java
`BigDecimal.HALF_UP` semantics), not toward positive infinity.
**Alternatives rejected:** `Math.round()` is the obvious one-liner, but it
breaks ties toward +∞: `Math.round(-2.5) === -2`. Three of the values this
stage persists — `score_delta`, `reward_delta`, `z_statistic` — are
routinely negative, and CONTRACTS §1.5 says "half-up" without qualifying it.
"Half-up" in every standard numeric library (Java, Python's `decimal`, SQL)
means away from zero, so `Math.round` would silently disagree with the spec
on exactly the negative values this engine produces most often.
**Revisit when:** CONTRACTS §1.5 is amended to specify a different tie rule.

**Decision:** all arithmetic runs at full double precision; `roundHalfUp` is
applied only when a value is written into the returned `ExperimentResult`,
never before a comparison.
**Alternatives rejected:** Rounding earlier (e.g. rounding `armStats` output
before computing `z`) would be simpler to follow, but CONTRACTS §1.5 is
explicit that rounding happens "at persistence time only", and rounding
first can flip a verdict: a true z of 1.95996 rounds to 1.96 and would
cross the accept threshold it should not have crossed.
**Revisit when:** never — this is the difference between a correct and a
subtly wrong decision boundary.

**Decision:** degenerate arms return zeros rather than `NaN` or a throw —
`armStats([])` is `{mean: 0, sd: 0, n: 0}`, and `armStats([one])` has
`sd: 0`.
**Alternatives rejected:** Letting the math produce `NaN` (0/0 for an empty
mean, division by `n−1 = 0` for a single sample) would propagate `NaN`
through `z` and every comparison, and `NaN >= 1.96` is `false` — so it would
land on "inconclusive" by accident rather than by decision, and would write
`NaN` into a persisted artifact. Throwing was also rejected: REWARD.md §8
specifies `decide` throws on a length *mismatch* and says nothing about
empty or single-sample arms, so adding a throw would invent a rule. Zeros
route an empty experiment to "inconclusive" through the spec's own
both-SDs-are-zero branch, which is the safe direction (it refuses to decide)
and requires no invented behavior.
**Revisit when:** REWARD.md gains an explicit minimum-n precondition for
`decide`, at which point enforcing it is better than tolerating it.

**Decision:** V005's `< −0.15` comparison is kept literal, with no epsilon
tolerance and no pre-rounding.
**Alternatives rejected:** Adding an epsilon (`delta < -0.15 - 1e-9`) or
comparing rounded values would make the boundary behave the way the algebra
reads. Both were rejected because REWARD.md specifies neither, and both err
*permissively* — they let marginal collapses through a safety gate. Erring
permissively on a veto is the wrong direction. The float sensitivity is real
and is documented in `docs/OPEN_QUESTIONS.md` #14 with a pinned test rather
than silently smoothed over.
**Revisit when:** a human rules on `docs/OPEN_QUESTIONS.md` #14 — the fix is
a REWARD.md amendment specifying a comparison precision, not a local change.

**Decision:** `test-utils.ts` (sample fixture builders) lives in `src/` but
is deliberately not re-exported from `index.ts`.
**Alternatives rejected:** Putting it under a separate `test/` directory
would keep it further from the public surface, but the package's
`tsconfig.json` includes `src/**/*.ts` only, and every other package in this
repo colocates test material with source. Excluding it from the barrel keeps
it out of `@harness/engine`'s documented export surface
(`docs/PUBLIC_API.md`) while staying consistent with the repo's layout.
**Revisit when:** the fixture builders are needed by another package's tests,
at which point they deserve a real home rather than a cross-package import.

## Load-bearing assumptions

These are the assumptions behind the verdicts. A bug here is statistically
silent — the engine keeps producing plausible numbers while being wrong.

- **Samples within an arm are independent and identically distributed.** The
  two-sample z-test in `zStatistic()` assumes this outright. It is not true
  in practice: `collectMany()` (Stage 5) collects samples sequentially on one
  machine, so thermal throttling, background load, and OS scheduler state
  correlate adjacent samples, and any drift over the run correlates the arm's
  later samples with each other. **Failure mode:** correlated samples make
  the observed SD smaller than the true sampling variability, which inflates
  `z` and produces `accept`/`reject` verdicts more often than the nominal 5%
  false-positive rate. Nothing in this package can detect it.

- **The normal approximation holds at the `n` actually used.** REWARD.md §7
  justifies it "by n ≥ 91" but then mandates it "for ALL n including test
  overrides". `decide()` therefore applies a z-test at any `n` — including
  the `n_per_arm: 3` that Stage 7's own test uses. **Failure mode:** at small
  n the sample SD is a poor estimate of the population SD, and a z-test
  (unlike a t-test) does not widen its critical value to compensate, so it is
  anti-conservative — small-n experiments will claim significance they have
  not earned. This is spec-mandated behavior, not a defect in this code, but
  a reader should never treat a small-n `accept` as meaningful evidence.

- **Zero observed variance means infinite confidence.** When both arms have
  `sd === 0`, `zStatistic()` returns ±1e12, so *any* difference in mean —
  however tiny — becomes `accept` or `reject`. **Failure mode:** two of the
  seven metrics (`js_bytes`, `html_bytes`) are deterministic per build, and
  the whole reward can have zero variance whenever timing metrics happen to
  coincide across an arm, or whenever `n === 1`. A one-sample-per-arm
  experiment therefore yields a maximally confident verdict from a single
  observation each. Pinned by a test in `decide.test.ts` so it is visible,
  but it remains the most dangerous single behavior in this package.

- **The two arms have equal `n`, and one shared `n` is correct in the z
  denominator.** `decide()` enforces equality by throwing, and
  `zStatistic()` uses that single `n` for both `s_v²/n` and `s_b²/n`, exactly
  as REWARD.md §7 writes it. **Failure mode:** none while the throw holds —
  but if a future caller catches that throw and retries with mismatched arms,
  the formula would silently use the wrong denominator for one arm.

- **α = 0.05 is a per-experiment rate, and nothing corrects for the many
  experiments the loop runs.** `Z_CRITICAL = 1.96` gives a 5% false-positive
  rate for *one* fixed-horizon test. **Failure mode:** the autonomous loop
  (propose → experiment → ingest → repeat) runs an unbounded sequence of
  these, so the family-wise error rate grows toward certainty; roughly 1 in
  20 accepted proposals will be noise, and the KB will faithfully record each
  as `improves` evidence. ADR-0008 chose fixed-horizon per experiment and is
  silent on multiplicity. Nothing in this package or the KB layer
  down-weights repeatedly-tested dimensions.

- **`σ = 0.12` (ADR-0008's assumed reward SD) is what makes `N_PER_ARM = 91`
  the right number.** This package does not use σ directly — it only
  consumes the derived 91 — but every power guarantee behind that constant
  rests on the assumption. **Failure mode:** if the true per-sample reward SD
  is materially higher, 91 samples are underpowered and real improvements
  will keep landing `inconclusive`; if materially lower, the harness spends
  far more measurement time than needed. ADR-0008 sets the revisit band at
  [0.06, 0.24]; nothing checks observed SD against it automatically, and
  `armStats` output is the only place that number is ever visible.

- **V002 assumes a `run_index === 0` sample exists in the variant arm.**
  `evaluateVetoes()` looks it up with `.find()`; a11y is measured only on run
  0 (CONTRACTS §11.1), so no other sample carries the signal. **Failure
  mode:** if a caller ever passes a filtered or re-indexed arm with no run 0,
  V002 silently never fires and accessibility regressions pass the gate
  undetected. There is no error, just a missing veto.

- **V002–V004 inspect only the variant arm.** A baseline that is already
  failing hydration, throwing runtime errors, or violating the a11y contract
  contributes nothing to the veto decision. **Failure mode:** an experiment
  on an already-broken route can be accepted while still broken, because the
  vetoes ask "did the variant break?" not "is the variant healthy?". V001 and
  V005 do compare against baseline; V002–V004 do not.

## How to tell if this is still correct

Run `pnpm --filter @harness/engine typecheck && pnpm --filter @harness/engine test && pnpm --filter @harness/engine build`
from the repo root. Expect: typecheck emits nothing; test reports
`4 passed (4)` test files and `62 passed (62)` tests; build emits nothing.

The single most important assertion in the suite is in `reward.test.ts`:
`sampleReward()` must reproduce REWARD.md's Appendix worked example as
`0.7910666666666667` at full precision and `0.7911` when persisted. If that
one fails, either a threshold or a weight has drifted from the frozen spec,
and every verdict the engine has ever produced is suspect — do not adjust
the test, re-derive the tables from REWARD.md §2 and §3.

Second most important: `decide.test.ts`'s adversarial block, which asserts
the engine *refuses* to produce confident verdicts it has not earned (a
noisy improvement stays `inconclusive`; a veto is not outvoted by a large
reward gain). A regression that turns any of those into `accept` is the
failure mode this whole package is built to avoid.

## Escalated

Two entries appended to `docs/OPEN_QUESTIONS.md`:

- **#14** — V005's `< −0.15` boundary is float-representation-sensitive; a
  nominally-exact −0.15 collapse fires or not depending on the metric's
  arithmetic. Kept literal (no epsilon), pinned by an explanatory test, and
  flagged as needing a REWARD.md amendment if cross-metric determinism at
  the boundary ever matters. Erring toward *firing* the veto was chosen
  deliberately as the safe direction.
- **#15** — `MetricValues`/`SampleFlags`/`MeasurementSample` are now declared
  both in `packages/contracts/src/types.ts` (added here, per CONTRACTS §15's
  verbatim-transcription mandate) and in `packages/measure/src/collect.ts`
  (added by Stage 5 when they were absent from contracts). Structurally
  identical, so nothing breaks today; left un-refactored because
  `packages/measure/**` is outside this stage's write scope. Flagged as a
  one-edit cleanup for whichever stage next owns that package.

Separately, and not escalated: `MetricName`, `Verdict`, `MetricValues`,
`SampleFlags`, `MeasurementSample`, `MetricComparison`, and
`ExperimentResult` were added to `packages/contracts/src/types.ts` as
mechanical completion of that file's own frozen mandate — the same pattern
Stages 2 and 5 followed and documented, not a design decision.
