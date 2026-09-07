# REWARD.md — Reward Specification

**Status: FROZEN.** Version 1. Companion to `docs/CONTRACTS.md`; type names
used here are defined there. Stage 6 implements this document verbatim;
Stage 7 consumes it via Stage 6's module surface (§8 below).

---

## 1. Metrics

The seven metrics are `MetricName` in canonical order (CONTRACTS §2):
`lcp_ms, cls, tbt_ms, ttfb_ms, js_bytes, html_bytes, hydration_ms`.
All are **lower-is-better**. Capture definitions are CONTRACTS §11.2.

## 2. Normalization

Each metric value normalizes to a score in [0, 1] by a clamped linear ramp:

```
norm_m(v) = clamp((POOR_m − v) / (POOR_m − GOOD_m), 0, 1)
```

`v ≤ GOOD_m` scores 1.0; `v ≥ POOR_m` scores 0.0; linear in between.

| Metric         | `GOOD_m` | `POOR_m` |
|----------------|---------:|---------:|
| `lcp_ms`       | 2500     | 4000     |
| `cls`          | 0.10     | 0.25     |
| `tbt_ms`       | 200      | 600      |
| `ttfb_ms`      | 800      | 1800     |
| `js_bytes`     | 102400   | 358400   |
| `html_bytes`   | 51200    | 204800   |
| `hydration_ms` | 100      | 400      |

These thresholds are frozen. They are **not** the per-route budgets (budgets
gate vetoes; thresholds shape the reward).

## 3. Per-sample reward

```
reward(s) = Σ_m  W_m · norm_m(s.metrics[m])
```

| Metric         | Weight `W_m` |
|----------------|-------------:|
| `lcp_ms`       | 0.30 |
| `cls`          | 0.15 |
| `tbt_ms`       | 0.20 |
| `ttfb_ms`      | 0.10 |
| `js_bytes`     | 0.15 |
| `html_bytes`   | 0.05 |
| `hydration_ms` | 0.05 |

Weights sum to exactly 1.00, so `reward ∈ [0, 1]`. Rationale: ADR-0007.

Arm statistics over samples `s_1..s_n`: mean `x̄ = Σ reward(s_i)/n` and sample
standard deviation `s = sqrt(Σ(reward(s_i) − x̄)² / (n − 1))`.

`MetricComparison` scores (CONTRACTS §12) use `norm_m` applied to the **mean
raw metric** of each arm; the reward statistics use **per-sample** rewards.
Both are required outputs; do not conflate them.

## 4. Tiers and latency budgets

Tier semantics:

- `critical` — entry and conversion routes; regressions here are most costly.
- `standard` — the default for any route not otherwise classified.
- `deferred` — rarely visited or utility routes; loosest budgets.

Per-route budget defaults by tier (byte-identical to CONTRACTS §8.2, both
frozen; a route's own `budgets` override key-by-key):

| Metric        | `critical` | `standard` | `deferred` |
|---------------|-----------:|-----------:|-----------:|
| `lcp_ms`      | 1800       | 2500       | 4000       |
| `cls`         | 0.10       | 0.10       | 0.25       |
| `tbt_ms`      | 200        | 300        | 600        |
| `ttfb_ms`     | 500        | 800        | 1800       |
| `js_bytes`    | 153600     | 256000     | 512000     |
| `html_bytes`  | 102400     | 153600     | 204800     |
| `hydration_ms`| 200        | 300        | 500        |

A budget bounds the acceptable per-arm **mean** of the raw metric.

## 5. Veto list

Vetoes are evaluated **before** the statistical decision, on the experiment's
two sample sets (baseline b, variant v, each of size n) and the target route's
resolved budgets. Evaluate all five; collect every firing code (sorted
ascending) into `veto_codes`. If any fires, the verdict is `"veto"`
regardless of reward.

| Code | Name | Fires when |
|------|------|------------|
| `V001` | `BUDGET_BREACH`   | for some metric m: `mean_v(m) > budget(m)` **and** `mean_v(m) > mean_b(m)` — the variant breaches the budget and is not an improvement over baseline on that metric. |
| `V002` | `A11Y_CONTRACT`   | the variant's `run_index 0` sample has `flags.a11y_violations > 0`. |
| `V003` | `HYDRATION_FAILURE` | the count of variant samples with `flags.hydration_failures > 0` is ≥ 2 (i.e. exceeds `FLAKE_TOLERANCE = 1`). |
| `V004` | `RUNTIME_ERROR`   | the count of variant samples with `flags.runtime_errors > 0` is ≥ 2. |
| `V005` | `METRIC_COLLAPSE` | for some metric m: `norm_m(mean_v(m)) − norm_m(mean_b(m)) < −0.15` — a single metric's normalized score collapses even if overall reward improves. |

## 6. Minimum sample size

Two-arm comparison of mean per-sample reward, powered for a minimum detectable
effect on the reward scale:

```
n_per_arm = ceil( 2 · (z_{1−α/2} + z_{1−β})² · σ² / δ² )
```

Frozen parameters:

| Parameter | Value  | Meaning |
|-----------|--------|---------|
| α         | 0.05   | two-sided significance level; `z_{1−α/2} = 1.9600` |
| 1 − β     | 0.80   | power; `z_{1−β} = 0.8416` |
| σ         | 0.12   | **assumed baseline standard deviation of per-sample reward** (in reward units; assumption recorded in ADR-0008) |
| δ         | 0.05   | minimum detectable effect (reward units) |

Derivation: `(1.9600 + 0.8416)² = 7.8490`; `2 · 7.8490 · 0.12² = 0.226050`;
`0.226050 / 0.05² = 90.42`; `ceil →` **`N_PER_ARM = 91`**.

Experiments are fixed-horizon: collect exactly `n_per_arm` samples per arm,
then decide once. No peeking, no early stopping, no sequential analysis
(ADR-0008). `n_per_arm` is `N_PER_ARM = 91` in production; tests may pass a
smaller override through `runExperiment` (CONTRACTS §12) — the decision
procedure is unchanged.

## 7. Decision procedure

Given baseline and variant per-sample reward stats (x̄_b, s_b, n) and
(x̄_v, s_v, n):

1. Evaluate vetoes (§5). If any fire → verdict `"veto"`.
2. Otherwise compute the two-sample z statistic
   (normal approximation, justified by n ≥ 91; used for ALL n including test
   overrides):

   ```
   z = (x̄_v − x̄_b) / sqrt(s_v²/n + s_b²/n)
   ```

   If both s_v and s_b are 0: z = 0 when x̄_v = x̄_b, else z = +∞ · sign(x̄_v − x̄_b)
   (implement as ±1e12).
3. Verdict: `z ≥ 1.96` → `"accept"`; `z ≤ −1.96` → `"reject"`;
   otherwise → `"inconclusive"`.

Verdict → `ProposalStatus` mapping: `accept → accepted`, `reject → rejected`,
`veto → vetoed`, `inconclusive → inconclusive`. Every verdict (including
`veto` and `inconclusive`) is ingested into the KB per CONTRACTS §13.4.

## 8. Module surface (Stage 6)

```ts
// src/reward/normalize.ts
function normalize(metric: MetricName, value: number): number;       // §2
// src/reward/reward.ts
function sampleReward(m: MetricValues): number;                      // §3
function armStats(samples: MeasurementSample[]): { mean: number; sd: number; n: number };
// src/reward/veto.ts
function evaluateVetoes(
  baseline: MeasurementSample[],
  variant: MeasurementSample[],
  budgets: RouteBudgets,
): VetoCode[];                                                       // §5
// src/reward/decide.ts — pure; performs §5 + §7 and assembles the result.
// Throws if baseline.length !== variant.length; n_per_arm = baseline.length.
function decide(opts: {
  experiment_id: string; proposal_id: string; target_route_id: string;
  baseline_profile_id: string; variant_profile_id: string;
  started_at: string; completed_at: string;
  baseline: MeasurementSample[]; variant: MeasurementSample[];
  budgets: RouteBudgets;
}): ExperimentResult;
```

---

## Appendix — Worked example (normative test vector for Stage 6)

One sample with metrics: `lcp_ms 3100, cls 0.05, tbt_ms 260, ttfb_ms 400,
js_bytes 180224, html_bytes 30720, hydration_ms 180`.

| Metric | Score | Weighted |
|--------|-------|----------|
| `lcp_ms`: (4000−3100)/1500        | 0.6      | 0.18 |
| `cls`: 0.05 ≤ 0.10                | 1.0      | 0.15 |
| `tbt_ms`: (600−260)/400           | 0.85     | 0.17 |
| `ttfb_ms`: 400 ≤ 800              | 1.0      | 0.10 |
| `js_bytes`: (358400−180224)/256000| 0.696    | 0.1044 |
| `html_bytes`: 30720 ≤ 51200       | 1.0      | 0.05 |
| `hydration_ms`: (400−180)/300     | 0.733333…| 0.036667 |

`reward = 0.7910667 → persisted as 0.7911` (CONTRACTS §1.5 rounding).
A Stage-6 test MUST reproduce this value exactly.

END OF FROZEN SURFACE
