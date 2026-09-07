import { describe, it, expect } from "vitest";
import { sampleReward, armStats } from "./reward";
import { roundHalfUp } from "./normalize";
import { makeSample, makeArm, MID_METRICS } from "./test-utils";
import type { MetricValues } from "@harness/contracts";

describe("sampleReward (docs/REWARD.md §3)", () => {
  it("reproduces the REWARD.md Appendix worked example exactly: 0.7911", () => {
    const metrics: MetricValues = {
      lcp_ms: 3100,
      cls: 0.05,
      tbt_ms: 260,
      ttfb_ms: 400,
      js_bytes: 180224,
      html_bytes: 30720,
      hydration_ms: 180,
    };
    const raw = sampleReward(metrics);
    // Full-precision intermediate value from the Appendix table:
    // 0.18 + 0.15 + 0.17 + 0.10 + 0.1044 + 0.05 + 0.036666... = 0.7910666...
    expect(raw).toBeCloseTo(0.7910666666666667, 12);
    // Persisted value, rounded half-up to 4dp per CONTRACTS §1.5.
    expect(roundHalfUp(raw)).toBe(0.7911);
  });

  it("returns exactly 1 when every metric is at or better than GOOD", () => {
    const allGood: MetricValues = {
      lcp_ms: 0,
      cls: 0,
      tbt_ms: 0,
      ttfb_ms: 0,
      js_bytes: 0,
      html_bytes: 0,
      hydration_ms: 0,
    };
    expect(sampleReward(allGood)).toBeCloseTo(1, 12);
  });

  it("returns exactly 0 when every metric is at or worse than POOR", () => {
    const allPoor: MetricValues = {
      lcp_ms: 99999,
      cls: 99,
      tbt_ms: 99999,
      ttfb_ms: 99999,
      js_bytes: 9999999,
      html_bytes: 9999999,
      hydration_ms: 99999,
    };
    expect(sampleReward(allPoor)).toBe(0);
  });

  it("is bounded in [0, 1] because the seven weights sum to exactly 1.00", () => {
    expect(sampleReward(MID_METRICS)).toBeCloseTo(0.5, 12);
    for (const metrics of [MID_METRICS, { ...MID_METRICS, lcp_ms: 0 }, { ...MID_METRICS, lcp_ms: 99999 }]) {
      const r = sampleReward(metrics as MetricValues);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it("weights each metric by its REWARD.md §3 weight (moving lcp_ms full-range shifts reward by 0.30)", () => {
    const best = sampleReward({ ...MID_METRICS, lcp_ms: 2500 }); // lcp score 1.0
    const worst = sampleReward({ ...MID_METRICS, lcp_ms: 4000 }); // lcp score 0.0
    expect(best - worst).toBeCloseTo(0.3, 12);
  });

  it("weights html_bytes and hydration_ms at 0.05 each", () => {
    const bestHtml = sampleReward({ ...MID_METRICS, html_bytes: 51200 });
    const worstHtml = sampleReward({ ...MID_METRICS, html_bytes: 204800 });
    expect(bestHtml - worstHtml).toBeCloseTo(0.05, 12);

    const bestHyd = sampleReward({ ...MID_METRICS, hydration_ms: 100 });
    const worstHyd = sampleReward({ ...MID_METRICS, hydration_ms: 400 });
    expect(bestHyd - worstHyd).toBeCloseTo(0.05, 12);
  });
});

describe("armStats (docs/REWARD.md §3)", () => {
  it("computes the mean per-sample reward across an arm", () => {
    const samples = [
      makeSample("baseline", 0, { lcp_ms: 2500 }), // lcp score 1.0 -> reward 0.5 + 0.30*0.5 = 0.65
      makeSample("baseline", 1, { lcp_ms: 4000 }), // lcp score 0.0 -> reward 0.5 - 0.30*0.5 = 0.35
    ];
    const stats = armStats(samples);
    expect(stats.n).toBe(2);
    expect(stats.mean).toBeCloseTo(0.5, 12);
  });

  it("uses the n−1 (sample) denominator for standard deviation, not n", () => {
    const samples = [makeSample("baseline", 0, { lcp_ms: 2500 }), makeSample("baseline", 1, { lcp_ms: 4000 })];
    const stats = armStats(samples);
    // rewards are 0.65 and 0.35; mean 0.5; deviations ±0.15
    // sample SD (n-1=1): sqrt((0.15² + 0.15²)/1) = sqrt(0.045) ≈ 0.2121320
    // population SD (n=2) would be 0.15 — this assertion distinguishes them.
    expect(stats.sd).toBeCloseTo(Math.sqrt(0.045), 12);
    expect(stats.sd).not.toBeCloseTo(0.15, 6);
  });

  it("reports sd 0 for an arm whose samples are all identical", () => {
    const stats = armStats(makeArm("baseline", 5));
    expect(stats.n).toBe(5);
    expect(stats.sd).toBe(0);
    expect(stats.mean).toBeCloseTo(0.5, 12);
  });

  it("returns zeros (not NaN) for an empty arm", () => {
    const stats = armStats([]);
    expect(stats).toEqual({ mean: 0, sd: 0, n: 0 });
    expect(Number.isNaN(stats.mean)).toBe(false);
    expect(Number.isNaN(stats.sd)).toBe(false);
  });

  it("returns sd 0 (not NaN) for a single-sample arm, where sample SD is undefined", () => {
    const stats = armStats([makeSample("baseline", 0)]);
    expect(stats.n).toBe(1);
    expect(stats.sd).toBe(0);
    expect(Number.isNaN(stats.sd)).toBe(false);
    expect(stats.mean).toBeCloseTo(0.5, 12);
  });
});
