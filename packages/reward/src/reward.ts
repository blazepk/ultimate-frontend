// Per-sample reward and arm statistics, per docs/REWARD.md §3.
//
//   reward(s) = Σ_m  W_m · norm_m(s.metrics[m])
//
// Weights sum to exactly 1.00, so reward ∈ [0, 1]. Rationale: ADR-0007.

import type { MetricName, MetricValues, MeasurementSample } from "@harness/contracts";
import { normalize, METRIC_NAMES } from "./normalize";

// REWARD.md §3 table, verbatim.
const WEIGHTS: Record<MetricName, number> = {
  lcp_ms: 0.3,
  cls: 0.15,
  tbt_ms: 0.2,
  ttfb_ms: 0.1,
  js_bytes: 0.15,
  html_bytes: 0.05,
  hydration_ms: 0.05,
};

// REWARD.md §8 — function sampleReward(m: MetricValues): number
export function sampleReward(m: MetricValues): number {
  let total = 0;
  for (const metric of METRIC_NAMES) {
    total += WEIGHTS[metric] * normalize(metric, m[metric]);
  }
  return total;
}

// REWARD.md §8 — function armStats(samples): { mean, sd, n }
// mean x̄ = Σ reward(s_i)/n; sample SD s = sqrt(Σ(reward_i − x̄)² / (n − 1)).
//
// Degenerate arms (REWARD.md specifies neither, and `decide` is only
// required to throw on a length MISMATCH, not on small/empty arms):
//   n = 0 → { mean: 0, sd: 0, n: 0 }. Returning 0 rather than NaN keeps
//           NaN out of every downstream comparison; decide()'s both-SDs-zero
//           branch then yields z = 0 → "inconclusive", which is the safe
//           direction (refuses to decide on no data) rather than a
//           fabricated verdict.
//   n = 1 → sd is mathematically undefined (n−1 = 0); returns 0. Combined
//           with the same both-SDs-zero branch this makes a single-sample
//           arm capable of producing z = ±1e12 → accept/reject. That is what
//           the frozen §7 text specifies, but it is statistically
//           meaningless — see docs/decisions/06-reward-engine.md.
export function armStats(samples: MeasurementSample[]): { mean: number; sd: number; n: number } {
  const n = samples.length;
  if (n === 0) return { mean: 0, sd: 0, n: 0 };

  const rewards = samples.map((s) => sampleReward(s.metrics));
  const mean = rewards.reduce((sum, r) => sum + r, 0) / n;
  if (n === 1) return { mean, sd: 0, n };

  const variance = rewards.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (n - 1);
  return { mean, sd: Math.sqrt(variance), n };
}
