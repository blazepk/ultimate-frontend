// Metric normalization per docs/REWARD.md §2.
//
//   norm_m(v) = clamp((POOR_m − v) / (POOR_m − GOOD_m), 0, 1)
//
// All seven metrics are lower-is-better: v ≤ GOOD_m scores 1.0, v ≥ POOR_m
// scores 0.0, linear in between. These thresholds are NOT the per-route
// budgets of CONTRACTS §8.2 — budgets gate vetoes, these shape the reward.

import type { MetricName } from "@harness/contracts";

interface Thresholds {
  good: number;
  poor: number;
}

// REWARD.md §2 table, verbatim.
const THRESHOLDS: Record<MetricName, Thresholds> = {
  lcp_ms: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  tbt_ms: { good: 200, poor: 600 },
  ttfb_ms: { good: 800, poor: 1800 },
  js_bytes: { good: 102400, poor: 358400 },
  html_bytes: { good: 51200, poor: 204800 },
  hydration_ms: { good: 100, poor: 400 },
};

// Canonical MetricName order (CONTRACTS §2) — normative wherever metrics are
// iterated or arrays are ordered.
export const METRIC_NAMES: readonly MetricName[] = [
  "lcp_ms",
  "cls",
  "tbt_ms",
  "ttfb_ms",
  "js_bytes",
  "html_bytes",
  "hydration_ms",
];

// REWARD.md §8 — function normalize(metric: MetricName, value: number): number
export function normalize(metric: MetricName, value: number): number {
  const { good, poor } = THRESHOLDS[metric];
  const ratio = (poor - value) / (poor - good);
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}

// CONTRACTS §1.5: persisted floats are rounded half-up to 4 decimal places
// AT PERSISTENCE TIME ONLY — all intermediate arithmetic keeps full double
// precision. "Half-up" is the Java BigDecimal HALF_UP sense: ties round away
// from zero (so −2.5 → −3), NOT JavaScript's Math.round, which breaks ties
// toward +∞ (−2.5 → −2). That distinction matters here because score_delta,
// reward_delta, and z_statistic are all routinely negative.
//
// The exponential-notation round-trip avoids the classic scaling artifact
// where e.g. 1.005 * 100 === 100.49999999999999 and would round down.
export function roundHalfUp(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const rounded = Number(`${Math.round(Number(`${abs}e${decimals}`))}e-${decimals}`);
  return sign * rounded;
}
