import { describe, it, expect } from "vitest";
import { decide } from "./decide";
import { sampleReward } from "./reward";
import { makeArm, makeSample } from "./test-utils";
import type { MeasurementSample, RouteBudgets } from "@harness/contracts";

// Loose enough that MID_METRICS never breaches — so each test isolates the
// behavior it targets rather than accidentally tripping V001.
const looseBudgets: RouteBudgets = {
  lcp_ms: 99999,
  cls: 99,
  tbt_ms: 99999,
  ttfb_ms: 99999,
  js_bytes: 9999999,
  html_bytes: 9999999,
  hydration_ms: 99999,
};

function run(baseline: MeasurementSample[], variant: MeasurementSample[], budgets: RouteBudgets = looseBudgets) {
  return decide({
    experiment_id: "ex_1700000000000_0000",
    proposal_id: "pr_1700000000000_0000",
    target_route_id: "home",
    baseline_profile_id: "bp_1700000000000_0000",
    variant_profile_id: "bp_1700000000000_0001",
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: "2026-01-01T01:00:00.000Z",
    baseline,
    variant,
    budgets,
  });
}

// With MID_METRICS every metric scores 0.5, so reward is 0.5. Moving only
// lcp_ms (weight 0.30, GOOD 2500 / POOR 4000) gives a single controllable
// dial: reward = 0.35 + 0.30 * norm(lcp_ms).
//   lcp 3250 -> score 0.50 -> reward 0.50
//   lcp 3100 -> score 0.60 -> reward 0.53
const LCP_NEUTRAL = 3250;
const LCP_BETTER = 3100;

describe("decide — structural contract (docs/CONTRACTS.md §12)", () => {
  it("throws when the two arms differ in size", () => {
    expect(() => run(makeArm("baseline", 3), makeArm("variant", 4))).toThrow(/same size/);
  });

  it("echoes n_per_arm from the arm length and passes identifiers through unchanged", () => {
    const result = run(makeArm("baseline", 5), makeArm("variant", 5));
    expect(result.schema_version).toBe(1);
    expect(result.n_per_arm).toBe(5);
    expect(result.experiment_id).toBe("ex_1700000000000_0000");
    expect(result.proposal_id).toBe("pr_1700000000000_0000");
    expect(result.target_route_id).toBe("home");
    expect(result.baseline_profile_id).toBe("bp_1700000000000_0000");
    expect(result.variant_profile_id).toBe("bp_1700000000000_0001");
    expect(result.started_at).toBe("2026-01-01T00:00:00.000Z");
    expect(result.completed_at).toBe("2026-01-01T01:00:00.000Z");
  });

  it("emits exactly 7 metric_comparisons in canonical MetricName order", () => {
    const result = run(makeArm("baseline", 4), makeArm("variant", 4));
    expect(result.metric_comparisons).toHaveLength(7);
    expect(result.metric_comparisons.map((c) => c.metric)).toEqual([
      "lcp_ms",
      "cls",
      "tbt_ms",
      "ttfb_ms",
      "js_bytes",
      "html_bytes",
      "hydration_ms",
    ]);
  });

  it("computes metric_comparisons from arm MEANS of the raw metric, scored via normalize", () => {
    // baseline lcp mean = (2500 + 4000)/2 = 3250 -> score 0.5
    // variant  lcp mean = (2500 + 2500)/2 = 2500 -> score 1.0
    const baseline = [makeSample("baseline", 0, { lcp_ms: 2500 }), makeSample("baseline", 1, { lcp_ms: 4000 })];
    const variant = makeArm("variant", 2, { lcp_ms: 2500 });
    const lcp = run(baseline, variant).metric_comparisons[0];
    expect(lcp.baseline_mean).toBe(3250);
    expect(lcp.variant_mean).toBe(2500);
    expect(lcp.baseline_score).toBe(0.5);
    expect(lcp.variant_score).toBe(1);
    expect(lcp.score_delta).toBe(0.5);
  });

  it("rounds every persisted float to 4 decimal places (CONTRACTS §1.5)", () => {
    const baseline = makeArm("baseline", 3, { hydration_ms: 180 }); // score 0.7333...
    const result = run(baseline, makeArm("variant", 3, { hydration_ms: 180 }));
    const persisted = [
      ...result.metric_comparisons.flatMap((c) => [
        c.baseline_mean,
        c.variant_mean,
        c.baseline_score,
        c.variant_score,
        c.score_delta,
      ]),
      result.reward_baseline_mean,
      result.reward_baseline_sd,
      result.reward_variant_mean,
      result.reward_variant_sd,
      result.reward_delta,
      result.z_statistic,
    ];
    for (const value of persisted) {
      // A value rounded to 4dp is unchanged by rounding to 4dp again.
      expect(Number(value.toFixed(4))).toBe(value);
    }
    // and the specific 0.7333... case actually landed on 4dp
    expect(result.metric_comparisons[6].baseline_score).toBe(0.7333);
  });
});

describe("decide — the four verdicts (docs/REWARD.md §7)", () => {
  it("ACCEPT: variant reward is higher with zero variance in both arms (z = +1e12)", () => {
    const result = run(makeArm("baseline", 4, { lcp_ms: LCP_NEUTRAL }), makeArm("variant", 4, { lcp_ms: LCP_BETTER }));
    expect(result.verdict).toBe("accept");
    expect(result.veto_codes).toEqual([]);
    expect(result.reward_baseline_mean).toBe(0.5);
    expect(result.reward_variant_mean).toBe(0.53);
    expect(result.reward_delta).toBe(0.03);
    expect(result.z_statistic).toBe(1e12);
  });

  it("REJECT: variant reward is lower with zero variance in both arms (z = −1e12)", () => {
    const result = run(makeArm("baseline", 4, { lcp_ms: LCP_BETTER }), makeArm("variant", 4, { lcp_ms: LCP_NEUTRAL }));
    expect(result.verdict).toBe("reject");
    expect(result.veto_codes).toEqual([]);
    expect(result.reward_delta).toBe(-0.03);
    expect(result.z_statistic).toBe(-1e12);
  });

  it("INCONCLUSIVE: identical arms give z = 0", () => {
    const result = run(makeArm("baseline", 4), makeArm("variant", 4));
    expect(result.verdict).toBe("inconclusive");
    expect(result.z_statistic).toBe(0);
    expect(result.reward_delta).toBe(0);
  });

  it("INCONCLUSIVE: equal means with real nonzero variance in both arms", () => {
    const baseline = [
      makeSample("baseline", 0, { lcp_ms: 3240 }),
      makeSample("baseline", 1, { lcp_ms: 3260 }),
      makeSample("baseline", 2, { lcp_ms: 3240 }),
      makeSample("baseline", 3, { lcp_ms: 3260 }),
    ];
    const variant = [
      makeSample("variant", 0, { lcp_ms: 3260 }),
      makeSample("variant", 1, { lcp_ms: 3240 }),
      makeSample("variant", 2, { lcp_ms: 3260 }),
      makeSample("variant", 3, { lcp_ms: 3240 }),
    ];
    const result = run(baseline, variant);
    expect(result.reward_baseline_sd).toBeGreaterThan(0);
    expect(result.reward_variant_sd).toBeGreaterThan(0);
    expect(result.z_statistic).toBe(0);
    expect(result.verdict).toBe("inconclusive");
  });

  it("ACCEPT: a genuine improvement with real nonzero variance clears z ≥ 1.96", () => {
    const baseline = [
      makeSample("baseline", 0, { lcp_ms: 3240 }),
      makeSample("baseline", 1, { lcp_ms: 3260 }),
      makeSample("baseline", 2, { lcp_ms: 3250 }),
      makeSample("baseline", 3, { lcp_ms: 3250 }),
    ];
    const variant = [
      makeSample("variant", 0, { lcp_ms: 3090 }),
      makeSample("variant", 1, { lcp_ms: 3110 }),
      makeSample("variant", 2, { lcp_ms: 3100 }),
      makeSample("variant", 3, { lcp_ms: 3100 }),
    ];
    const result = run(baseline, variant);
    expect(result.reward_baseline_sd).toBeGreaterThan(0);
    expect(result.reward_variant_sd).toBeGreaterThan(0);
    expect(result.z_statistic).toBeGreaterThanOrEqual(1.96);
    expect(result.verdict).toBe("accept");
  });

  it("VETO: any firing veto forces the verdict regardless of the statistics", () => {
    // Same arms as the ACCEPT case above (a real, large reward improvement),
    // but with a11y violations on the variant's run_index 0 sample.
    const variant = makeArm("variant", 4, { lcp_ms: LCP_BETTER });
    variant[0].flags.a11y_violations = 1;
    const result = run(makeArm("baseline", 4, { lcp_ms: LCP_NEUTRAL }), variant);
    expect(result.reward_delta).toBeGreaterThan(0); // reward genuinely improved
    expect(result.verdict).toBe("veto");
    expect(result.veto_codes).toEqual(["V002"]);
  });

  it("veto_codes is non-empty if and only if the verdict is \"veto\"", () => {
    const clean = run(makeArm("baseline", 4), makeArm("variant", 4));
    expect(clean.verdict).not.toBe("veto");
    expect(clean.veto_codes).toEqual([]);

    const vetoed = makeArm("variant", 4);
    vetoed[0].flags.runtime_errors = 1;
    vetoed[1].flags.runtime_errors = 1;
    const result = run(makeArm("baseline", 4), vetoed);
    expect(result.verdict).toBe("veto");
    expect(result.veto_codes.length).toBeGreaterThan(0);
  });
});

describe("decide — adversarial: it must not emit a verdict it is not entitled to", () => {
  it("does not ACCEPT a large reward gain that is entirely within noise", () => {
    // Variant mean is higher, but both arms are so noisy that z < 1.96.
    // Rewards swing across the full lcp range in both arms.
    const baseline = [
      makeSample("baseline", 0, { lcp_ms: 2500 }),
      makeSample("baseline", 1, { lcp_ms: 4000 }),
      makeSample("baseline", 2, { lcp_ms: 2500 }),
      makeSample("baseline", 3, { lcp_ms: 4000 }),
    ];
    const variant = [
      makeSample("variant", 0, { lcp_ms: 2500 }),
      makeSample("variant", 1, { lcp_ms: 4000 }),
      makeSample("variant", 2, { lcp_ms: 2500 }),
      makeSample("variant", 3, { lcp_ms: 3900 }),
    ];
    const result = run(baseline, variant);
    expect(result.reward_delta).toBeGreaterThan(0); // variant does look better
    expect(Math.abs(result.z_statistic)).toBeLessThan(1.96); // but not significantly
    expect(result.verdict).toBe("inconclusive");
  });

  it("does not let a veto be outvoted by an overwhelming reward improvement", () => {
    // Variant is dramatically better on reward (0.35 -> 0.65, the full lcp
    // range) yet breaches a tight budget it also worsens: V001 must win.
    const baseline = makeArm("baseline", 4, { lcp_ms: 4000, tbt_ms: 250 });
    const variant = makeArm("variant", 4, { lcp_ms: 2500, tbt_ms: 400 });
    const result = run(baseline, variant, { ...looseBudgets, tbt_ms: 300 });
    expect(result.reward_delta).toBeGreaterThan(0.1);
    expect(result.verdict).toBe("veto");
    expect(result.veto_codes).toContain("V001");
  });

  it("treats a single-sample arm's undefined SD as zero rather than NaN (documented degenerate case)", () => {
    // n=1 makes sample SD mathematically undefined. armStats returns 0, so
    // §7's both-SDs-zero branch produces ±1e12 from ONE observation per arm.
    // This is what the frozen spec mandates; the test pins the behavior so a
    // future reader sees it is deliberate, not accidental.
    const result = run([makeSample("baseline", 0, { lcp_ms: LCP_NEUTRAL })], [makeSample("variant", 0, { lcp_ms: LCP_BETTER })]);
    expect(result.n_per_arm).toBe(1);
    expect(result.reward_baseline_sd).toBe(0);
    expect(result.z_statistic).toBe(1e12);
    expect(result.verdict).toBe("accept");
  });

  it("refuses to decide on empty arms — no NaN anywhere, verdict inconclusive", () => {
    const result = run([], []);
    expect(result.n_per_arm).toBe(0);
    expect(result.verdict).toBe("inconclusive");
    expect(Number.isNaN(result.z_statistic)).toBe(false);
    expect(Number.isNaN(result.reward_delta)).toBe(false);
    for (const comparison of result.metric_comparisons) {
      expect(Number.isNaN(comparison.baseline_mean)).toBe(false);
      expect(Number.isNaN(comparison.score_delta)).toBe(false);
    }
  });

  it("uses per-sample rewards for the reward statistics, not the reward of the mean metrics", () => {
    // normalize() clamps, so mean-then-score and score-then-mean genuinely
    // differ here: one baseline sample is far past POOR on lcp_ms.
    const baseline = [
      makeSample("baseline", 0, { lcp_ms: 2500 }), // score 1.0 -> reward 0.65
      makeSample("baseline", 1, { lcp_ms: 10000 }), // clamped to 0.0 -> reward 0.35
    ];
    const result = run(baseline, makeArm("variant", 2));
    // Per-sample mean reward = (0.65 + 0.35)/2 = 0.50.
    expect(result.reward_baseline_mean).toBe(0.5);
    // Whereas scoring the MEAN metric (6250, clamped to 0) would give 0.35 —
    // that value must NOT appear as the reward mean.
    expect(result.reward_baseline_mean).not.toBe(0.35);
    // The metric_comparison, by contrast, DOES score the mean: 6250 -> 0.
    expect(result.metric_comparisons[0].baseline_mean).toBe(6250);
    expect(result.metric_comparisons[0].baseline_score).toBe(0);
    // sanity: the two per-sample rewards really are 0.65 and 0.35
    expect(sampleReward(baseline[0].metrics)).toBeCloseTo(0.65, 12);
    expect(sampleReward(baseline[1].metrics)).toBeCloseTo(0.35, 12);
  });
});
