// The decision procedure, per docs/REWARD.md §7 and §8. Pure: performs §5
// (vetoes) then §7 (statistics) and assembles the CONTRACTS §12
// ExperimentResult.

import type { ExperimentResult, MeasurementSample, MetricComparison, RouteBudgets, Verdict } from "@harness/contracts";
import { normalize, roundHalfUp, METRIC_NAMES } from "./normalize";
import { armStats } from "./reward";
import { evaluateVetoes, metricMeans } from "./veto";

// REWARD.md §7 step 3: two-sided critical value at α = 0.05.
const Z_CRITICAL = 1.96;

// REWARD.md §7 step 2: stand-in for ±∞ when both arms have zero variance.
const Z_INFINITE = 1e12;

// REWARD.md §7 step 2. Computed at FULL precision — rounding happens only
// when the value is written into the result (CONTRACTS §1.5), never before a
// comparison, since rounding first could flip a verdict near the threshold.
function zStatistic(baselineMean: number, baselineSd: number, variantMean: number, variantSd: number, n: number): number {
  if (baselineSd === 0 && variantSd === 0) {
    if (variantMean === baselineMean) return 0;
    return variantMean > baselineMean ? Z_INFINITE : -Z_INFINITE;
  }
  const denominator = Math.sqrt((variantSd * variantSd) / n + (baselineSd * baselineSd) / n);
  if (denominator === 0) return 0;
  return (variantMean - baselineMean) / denominator;
}

function verdictFromZ(z: number): Verdict {
  if (z >= Z_CRITICAL) return "accept";
  if (z <= -Z_CRITICAL) return "reject";
  return "inconclusive";
}

// REWARD.md §8 — function decide(opts): ExperimentResult
export function decide(opts: {
  experiment_id: string;
  proposal_id: string;
  target_route_id: string;
  baseline_profile_id: string;
  variant_profile_id: string;
  started_at: string;
  completed_at: string;
  baseline: MeasurementSample[];
  variant: MeasurementSample[];
  budgets: RouteBudgets;
}): ExperimentResult {
  if (opts.baseline.length !== opts.variant.length) {
    throw new Error(
      `decide: arms must be the same size (baseline ${opts.baseline.length}, variant ${opts.variant.length})`,
    );
  }
  const n_per_arm = opts.baseline.length;

  // MetricComparison uses norm_m applied to the MEAN RAW METRIC of each arm.
  // The reward statistics below use PER-SAMPLE rewards instead. REWARD.md §3
  // is explicit that these are different quantities: "Both are required
  // outputs; do not conflate them."
  const baselineMeans = metricMeans(opts.baseline);
  const variantMeans = metricMeans(opts.variant);
  const metric_comparisons: MetricComparison[] = METRIC_NAMES.map((metric) => {
    const baseline_score = normalize(metric, baselineMeans[metric]);
    const variant_score = normalize(metric, variantMeans[metric]);
    return {
      metric,
      baseline_mean: roundHalfUp(baselineMeans[metric]),
      variant_mean: roundHalfUp(variantMeans[metric]),
      baseline_score: roundHalfUp(baseline_score),
      variant_score: roundHalfUp(variant_score),
      score_delta: roundHalfUp(variant_score - baseline_score),
    };
  });

  const baselineStats = armStats(opts.baseline);
  const variantStats = armStats(opts.variant);

  // §7 step 1: vetoes are evaluated first and outrank the statistics
  // entirely — a firing veto forces "veto" no matter how strong the reward
  // improvement is (ADR-0007's lexicographic safety gate).
  const veto_codes = evaluateVetoes(opts.baseline, opts.variant, opts.budgets);

  const z = zStatistic(baselineStats.mean, baselineStats.sd, variantStats.mean, variantStats.sd, n_per_arm);
  const verdict: Verdict = veto_codes.length > 0 ? "veto" : verdictFromZ(z);

  return {
    schema_version: 1,
    experiment_id: opts.experiment_id,
    proposal_id: opts.proposal_id,
    target_route_id: opts.target_route_id,
    baseline_profile_id: opts.baseline_profile_id,
    variant_profile_id: opts.variant_profile_id,
    n_per_arm,
    started_at: opts.started_at,
    completed_at: opts.completed_at,
    metric_comparisons,
    reward_baseline_mean: roundHalfUp(baselineStats.mean),
    reward_baseline_sd: roundHalfUp(baselineStats.sd),
    reward_variant_mean: roundHalfUp(variantStats.mean),
    reward_variant_sd: roundHalfUp(variantStats.sd),
    reward_delta: roundHalfUp(variantStats.mean - baselineStats.mean),
    z_statistic: roundHalfUp(z),
    verdict,
    veto_codes,
  };
}
