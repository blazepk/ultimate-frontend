import { describe, it, expect } from "vitest";
import { normalize, roundHalfUp, METRIC_NAMES } from "./normalize";
import type { MetricName } from "@harness/contracts";

describe("normalize (docs/REWARD.md §2)", () => {
  it("scores 1.0 at or below GOOD_m for every metric", () => {
    const atGood: Record<MetricName, number> = {
      lcp_ms: 2500,
      cls: 0.1,
      tbt_ms: 200,
      ttfb_ms: 800,
      js_bytes: 102400,
      html_bytes: 51200,
      hydration_ms: 100,
    };
    for (const metric of METRIC_NAMES) {
      expect(normalize(metric, atGood[metric])).toBe(1);
      expect(normalize(metric, atGood[metric] / 2)).toBe(1); // well below GOOD
      expect(normalize(metric, 0)).toBe(1);
    }
  });

  it("scores 0.0 at or above POOR_m for every metric", () => {
    const atPoor: Record<MetricName, number> = {
      lcp_ms: 4000,
      cls: 0.25,
      tbt_ms: 600,
      ttfb_ms: 1800,
      js_bytes: 358400,
      html_bytes: 204800,
      hydration_ms: 400,
    };
    for (const metric of METRIC_NAMES) {
      expect(normalize(metric, atPoor[metric])).toBe(0);
      expect(normalize(metric, atPoor[metric] * 2)).toBe(0); // well above POOR
    }
  });

  it("is linear strictly between GOOD and POOR (midpoint scores 0.5)", () => {
    // lcp_ms: GOOD 2500, POOR 4000 -> midpoint 3250
    expect(normalize("lcp_ms", 3250)).toBeCloseTo(0.5, 12);
    // tbt_ms: GOOD 200, POOR 600 -> midpoint 400
    expect(normalize("tbt_ms", 400)).toBeCloseTo(0.5, 12);
    // hydration_ms: GOOD 100, POOR 400 -> midpoint 250
    expect(normalize("hydration_ms", 250)).toBeCloseTo(0.5, 12);
  });

  it("reproduces every per-metric score from the REWARD.md Appendix worked example", () => {
    expect(normalize("lcp_ms", 3100)).toBeCloseTo(0.6, 12); // (4000-3100)/1500
    expect(normalize("cls", 0.05)).toBe(1); // 0.05 <= 0.10, clamped
    expect(normalize("tbt_ms", 260)).toBeCloseTo(0.85, 12); // (600-260)/400
    expect(normalize("ttfb_ms", 400)).toBe(1); // 400 <= 800, clamped
    expect(normalize("js_bytes", 180224)).toBeCloseTo(0.696, 12); // (358400-180224)/256000
    expect(normalize("html_bytes", 30720)).toBe(1); // 30720 <= 51200, clamped
    expect(normalize("hydration_ms", 180)).toBeCloseTo(0.7333333333333333, 12); // (400-180)/300
  });

  it("never returns a value outside [0, 1], including for negative input", () => {
    for (const metric of METRIC_NAMES) {
      for (const value of [-1000, -1, 0, 1, 1e9]) {
        const score = normalize(metric, value);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });

  it("METRIC_NAMES is the canonical CONTRACTS §2 order", () => {
    expect(METRIC_NAMES).toEqual(["lcp_ms", "cls", "tbt_ms", "ttfb_ms", "js_bytes", "html_bytes", "hydration_ms"]);
  });
});

describe("roundHalfUp (docs/CONTRACTS.md §1.5)", () => {
  it("rounds to 4 decimal places by default", () => {
    expect(roundHalfUp(0.7910666666)).toBe(0.7911);
    expect(roundHalfUp(0.12344)).toBe(0.1234);
    expect(roundHalfUp(0.12345)).toBe(0.1235);
  });

  it("breaks ties AWAY FROM ZERO, not toward +infinity (unlike Math.round)", () => {
    // The distinguishing case: Math.round(-2.5) === -2, but HALF_UP gives -3.
    expect(roundHalfUp(-0.00005)).toBe(-0.0001);
    expect(roundHalfUp(0.00005)).toBe(0.0001);
    expect(roundHalfUp(-2.5, 0)).toBe(-3);
    expect(Math.round(-2.5)).toBe(-2); // documents the difference being avoided
  });

  it("is immune to the float scaling artifact (1.005 at 2dp)", () => {
    expect(1.005 * 100).toBeLessThan(100.5); // the artifact this guards against
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
  });

  it("passes through non-finite values unchanged", () => {
    expect(roundHalfUp(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(roundHalfUp(Number.NaN))).toBe(true);
  });

  it("handles the ±1e12 z-statistic sentinel without distortion", () => {
    expect(roundHalfUp(1e12)).toBe(1e12);
    expect(roundHalfUp(-1e12)).toBe(-1e12);
  });
});
