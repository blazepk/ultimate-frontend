// Budget threshold evaluation per docs/CONTRACTS.md §8.1: a budget is the
// maximum acceptable per-arm mean for a metric on a route.
//
// docs/decisions/02-reconciliation.md / docs/RECONCILIATION.md §F.3: this is
// deliberately only the threshold half. Veto V001's baseline-comparison rule
// (docs/REWARD.md §5 — "and mean_v(m) > mean_b(m)") needs the baseline arm,
// which this package has no reason to hold; it is implemented in
// @harness/engine (packages/reward/src/veto.ts) per REWARD.md §8, composed
// on top of `checkBudget` below.

import type { RouteBudgets } from "./types";

export type BudgetMetricKey = keyof RouteBudgets;

// Canonical metric order (CONTRACTS.md §2).
const METRIC_KEYS: readonly BudgetMetricKey[] = [
  "lcp_ms",
  "cls",
  "tbt_ms",
  "ttfb_ms",
  "js_bytes",
  "html_bytes",
  "hydration_ms",
];

export type MetricMeans = Record<BudgetMetricKey, number>;

export interface BudgetCheckResult {
  pass: boolean;
  breaching_fields: BudgetMetricKey[];
}

// A mean strictly greater than its budget breaches ("maximum acceptable"
// implies a mean equal to the budget still passes).
export function checkBudget(means: MetricMeans, budgets: RouteBudgets): BudgetCheckResult {
  const breaching_fields = METRIC_KEYS.filter((key) => means[key] > budgets[key]);
  return { pass: breaching_fields.length === 0, breaching_fields };
}
