---
stage: 6
name: reward-engine
model: Opus 5
write_scope: packages/reward/src/**
requires:
  - docs/RULES.md
  - docs/REWARD.md
  - docs/CONTRACTS.md#§1.4
  - docs/CONTRACTS.md#§1.5
  - docs/CONTRACTS.md#§2
  - docs/CONTRACTS.md#§11.1
  - docs/CONTRACTS.md#§12
  - docs/PUBLIC_API.md
  - docs/decisions/02-reconciliation.md
  - packages/reward/package.json
  - packages/contracts/src/types.ts
  - packages/contracts/src/budget.ts
  - packages/reward/src/veto.ts
  - packages/reward/src/veto.test.ts
provides:
  - packages/reward/src/normalize.ts
  - packages/reward/src/normalize.test.ts
  - packages/reward/src/reward.ts
  - packages/reward/src/reward.test.ts
  - packages/reward/src/veto.ts (extended — see below)
  - packages/reward/src/veto.test.ts (extended — see below)
  - packages/reward/src/decide.ts
  - packages/reward/src/decide.test.ts
  - packages/reward/src/index.ts (extended)
verify: pnpm --filter @harness/engine typecheck && pnpm --filter @harness/engine test && pnpm --filter @harness/engine build
---

# Stage 6 — Reward engine · Opus 5

Follow `docs/RULES.md`. Read only what is in `requires` above.

## Status: this package already has a partial `veto.ts`

`packages/reward/` is published as **`@harness/engine`** (its directory
stays `reward`; see `docs/PUBLIC_API.md`'s note on the reward+experiment
merge — do not rename the directory, do not rename the package again). It
already has a workspace dependency on `@harness/contracts` and one file,
`veto.ts`, exporting `checkV001BudgetBreach(baselineMeans, variantMeans,
budgets): VetoCode[]` — built during the Stage 2.5 recovery, deliberately
scoped to **only** V001's baseline-comparison conjunct
(`docs/decisions/02-reconciliation.md` explains why: REWARD.md wasn't
available to the stage that first needed it). Read it and its test file
first.

Your job **extends** `veto.ts` into the full `evaluateVetoes` surface
REWARD.md §8 specifies (all five veto codes), reusing
`checkV001BudgetBreach` for V001 rather than re-deriving that logic. Do not
delete it or duplicate its predicate.

## TASK

Implement metric normalization, per-sample reward, the complete veto list,
and the accept/reject/veto/inconclusive decision procedure.

## OUTPUTS

### `packages/reward/src/normalize.ts` + colocated test

REWARD.md §2:

```ts
function normalize(metric: MetricName, value: number): number;
```

`norm_m(v) = clamp((POOR_m − v) / (POOR_m − GOOD_m), 0, 1)`. GOOD/POOR
thresholds per metric (REWARD.md §2 table — quote them exactly; they are
NOT the same as the CONTRACTS §8.2 budget table).

### `packages/reward/src/reward.ts` + colocated test

REWARD.md §3:

```ts
function sampleReward(m: MetricValues): number;
function armStats(samples: MeasurementSample[]): { mean: number; sd: number; n: number };
```

`reward(s) = Σ_m W_m · norm_m(s.metrics[m])` over the seven weights in
REWARD.md §3 (sum to exactly 1.00). `armStats` computes the sample mean and
sample standard deviation (n−1 denominator) of per-sample reward across an
arm's samples. Test MUST reproduce the REWARD.md Appendix worked example
exactly: reward = **0.7911** for the given sample (rounded half-up to 4
decimals per CONTRACTS §1.5 — only at persistence, not during intermediate
arithmetic).

### `packages/reward/src/veto.ts` — extend to the full surface

REWARD.md §8's frozen signature:

```ts
function evaluateVetoes(
  baseline: MeasurementSample[],
  variant: MeasurementSample[],
  budgets: RouteBudgets,
): VetoCode[];
```

Implement all five vetoes (REWARD.md §5), collecting every firing code
(sorted ascending):

- **V001** `BUDGET_BREACH` — reuse `checkV001BudgetBreach`, feeding it the
  per-metric arm means computed from `baseline`/`variant`.
- **V002** `A11Y_CONTRACT` — the variant's `run_index 0` sample has
  `flags.a11y_violations > 0`.
- **V003** `HYDRATION_FAILURE` — count of variant samples with
  `flags.hydration_failures > 0` is ≥ 2 (exceeds `FLAKE_TOLERANCE = 1`,
  CONTRACTS §1.4).
- **V004** `RUNTIME_ERROR` — count of variant samples with
  `flags.runtime_errors > 0` is ≥ 2.
- **V005** `METRIC_COLLAPSE` — for some metric m:
  `norm_m(mean_v(m)) − norm_m(mean_b(m)) < −0.15`.

Tests MUST cover each veto code firing and not firing, independently.

### `packages/reward/src/decide.ts` + colocated test

REWARD.md §7 and §8:

```ts
function decide(opts: {
  experiment_id: string; proposal_id: string; target_route_id: string;
  baseline_profile_id: string; variant_profile_id: string;
  started_at: string; completed_at: string;
  baseline: MeasurementSample[]; variant: MeasurementSample[];
  budgets: RouteBudgets;
}): ExperimentResult;
```

Assembles `ExperimentResult` per CONTRACTS §12: `metric_comparisons` in
canonical `MetricName` order (§2: `lcp_ms, cls, tbt_ms, ttfb_ms, js_bytes,
html_bytes, hydration_ms`), each with `baseline_mean`/`variant_mean` (raw
metric means) and `baseline_score`/`variant_score` (`normalize()` applied to
those means) and `score_delta`. Reward stats use `armStats` (per-sample, not
per-mean). Decision: evaluate vetoes first — any firing code → verdict
`"veto"`. Otherwise compute the two-sample z statistic:

```
z = (x̄_v − x̄_b) / sqrt(s_v²/n + s_b²/n)
```

(if both SDs are 0: z = 0 when means equal, else ±1e12). `z ≥ 1.96` →
`"accept"`; `z ≤ −1.96` → `"reject"`; otherwise `"inconclusive"`. Throws if
`baseline.length !== variant.length`; `n_per_arm = baseline.length`. All
persisted floats rounded half-up to 4 decimals (§1.5).

Tests MUST cover all four verdicts.

### `packages/reward/src/index.ts` — extend

Barrel matching `docs/PUBLIC_API.md`'s `@harness/engine` `"."` export
(re-exports reward + experiment — the experiment re-export doesn't exist
yet, Stage 7 adds it; keep the existing `export * from "./veto"` and add
`normalize`, `reward`, `decide`).

## DOCUMENTATION OUTPUT (required)

Also produce `docs/decisions/06-reward-engine.md` using exactly this
structure. The "Load-bearing assumptions" section is the most important one
in the whole documentation set for this stage — every statistical
assumption (variance model, independence, what z ≥ 1.96 implies) belongs
there with its failure mode named.

```
## What this stage built
Two to four sentences. What exists now that did not before, in terms a reader who has
not seen the code can follow.

## Decisions made during implementation
For each non-obvious choice, in this format:
  **Decision:** what was chosen
  **Alternatives rejected:** what else was viable, and specifically why not
  **Revisit when:** the concrete condition that would make this the wrong choice
Only include decisions where a competent engineer could reasonably have chosen otherwise.
Skip anything CONTRACTS.md already dictated — that is Stage 0's record, not yours.

## Load-bearing assumptions
What this code assumes to be true that is not enforced by the type system. For each,
state what breaks if it stops holding. Be specific: name the function and the failure.

## How to tell if this is still correct
The command to run, and what its output should look like. A future reader must be able
to check this stage's health without reading the implementation.

## Escalated
Anything appended to docs/OPEN_QUESTIONS.md, and the conservative reading chosen instead.
```

Write for someone reading in six months with no memory of this work.

## VERIFY

`pnpm --filter @harness/engine typecheck && pnpm --filter @harness/engine test && pnpm --filter @harness/engine build`
