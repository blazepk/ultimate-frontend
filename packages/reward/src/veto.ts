// The veto list, per docs/REWARD.md §5 and §8.
//
// Vetoes are evaluated BEFORE the statistical decision. All five are
// evaluated (never short-circuited), every firing code is collected, and any
// firing code forces verdict "veto" regardless of how good the reward is —
// the lexicographic safety gate of ADR-0007.

import { checkBudget } from "@harness/contracts";
import type { RouteBudgets, VetoCode, MetricMeans, MeasurementSample, MetricName } from "@harness/contracts";
import { normalize, METRIC_NAMES } from "./normalize";

// CONTRACTS §1.4: failure vetoes fire at ≥ 2 affected samples, i.e. a single
// flaky sample is tolerated.
const FLAKE_TOLERANCE = 1;

// REWARD.md §5 V005: a single metric's normalized score may not collapse by
// more than this, even if overall reward improves.
const COLLAPSE_THRESHOLD = -0.15;

// V001 BUDGET_BREACH — for some metric m:
//   mean_v(m) > budget(m)  AND  mean_v(m) > mean_b(m)
//
// Built during the Stage 2.5 recovery (docs/decisions/02-reconciliation.md)
// before REWARD.md was available to the stage that first needed it; retained
// verbatim and composed into `evaluateVetoes` below rather than re-derived.
// Composes on @harness/contracts's `checkBudget`, which already computes the
// first conjunct ("mean_v(m) > budget(m)"), and adds the second.
export function checkV001BudgetBreach(
  baselineMeans: MetricMeans,
  variantMeans: MetricMeans,
  budgets: RouteBudgets,
): VetoCode[] {
  const { breaching_fields } = checkBudget(variantMeans, budgets);
  const worseThanBaseline = breaching_fields.some((m) => variantMeans[m] > baselineMeans[m]);
  return worseThanBaseline ? ["V001"] : [];
}

// Per-metric arm means over the raw metric values. Empty arms yield 0 rather
// than NaN, for the same reason armStats does (see reward.ts) — keeping NaN
// out of every downstream comparison.
export function metricMeans(samples: MeasurementSample[]): MetricMeans {
  const means = {} as MetricMeans;
  for (const metric of METRIC_NAMES) {
    means[metric] = samples.length === 0 ? 0 : samples.reduce((sum, s) => sum + s.metrics[metric], 0) / samples.length;
  }
  return means;
}

// REWARD.md §8 — function evaluateVetoes(baseline, variant, budgets): VetoCode[]
// Returns every firing code, sorted ascending (V001 … V005).
export function evaluateVetoes(
  baseline: MeasurementSample[],
  variant: MeasurementSample[],
  budgets: RouteBudgets,
): VetoCode[] {
  const codes: VetoCode[] = [];

  const baselineMeans = metricMeans(baseline);
  const variantMeans = metricMeans(variant);

  // V001 BUDGET_BREACH
  codes.push(...checkV001BudgetBreach(baselineMeans, variantMeans, budgets));

  // V002 A11Y_CONTRACT — the variant's run_index 0 sample specifically.
  // a11y is measured ONLY on run_index 0 (CONTRACTS §11.1), so any other
  // sample's a11y_violations is fixed at 0 and carries no information.
  const variantRunZero = variant.find((s) => s.run_index === 0);
  if (variantRunZero && variantRunZero.flags.a11y_violations > 0) {
    codes.push("V002");
  }

  // V003 HYDRATION_FAILURE — count of affected variant samples exceeds FLAKE_TOLERANCE.
  const hydrationFailureSamples = variant.filter((s) => s.flags.hydration_failures > 0).length;
  if (hydrationFailureSamples > FLAKE_TOLERANCE) {
    codes.push("V003");
  }

  // V004 RUNTIME_ERROR — same tolerance, on runtime errors.
  const runtimeErrorSamples = variant.filter((s) => s.flags.runtime_errors > 0).length;
  if (runtimeErrorSamples > FLAKE_TOLERANCE) {
    codes.push("V004");
  }

  // V005 METRIC_COLLAPSE — any single metric's normalized score dropping by
  // more than 0.15, evaluated on the arm MEANS (not per sample).
  const collapsed = METRIC_NAMES.some((metric: MetricName) => {
    const delta = normalize(metric, variantMeans[metric]) - normalize(metric, baselineMeans[metric]);
    return delta < COLLAPSE_THRESHOLD;
  });
  if (collapsed) {
    codes.push("V005");
  }

  return codes;
}
