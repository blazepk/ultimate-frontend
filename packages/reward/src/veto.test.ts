import { describe, it, expect } from "vitest";
import { checkV001BudgetBreach, evaluateVetoes, metricMeans } from "./veto";
import { makeArm, makeSample, MID_METRICS } from "./test-utils";
import type { RouteBudgets, MetricMeans } from "@harness/contracts";

const budgets: RouteBudgets = {
  lcp_ms: 2500,
  cls: 0.1,
  tbt_ms: 300,
  ttfb_ms: 800,
  js_bytes: 256000,
  html_bytes: 153600,
  hydration_ms: 300,
};

const baseline: MetricMeans = { ...budgets };

// Budgets loose enough that MID_METRICS never breaches them, so each
// evaluateVetoes test isolates exactly the one veto it targets.
const looseBudgets: RouteBudgets = {
  lcp_ms: 99999,
  cls: 99,
  tbt_ms: 99999,
  ttfb_ms: 99999,
  js_bytes: 9999999,
  html_bytes: 9999999,
  hydration_ms: 99999,
};

describe("checkV001BudgetBreach (docs/REWARD.md §5 V001)", () => {
  it("fires when the variant breaches its budget and is worse than baseline on that metric", () => {
    const variant: MetricMeans = { ...budgets, lcp_ms: 3000 };
    const baselineBetter: MetricMeans = { ...budgets, lcp_ms: 2000 };
    expect(checkV001BudgetBreach(baselineBetter, variant, budgets)).toEqual(["V001"]);
  });

  it("does NOT fire when the variant breaches budget but is not worse than baseline (pre-existing breach)", () => {
    const alreadyOverBudget: MetricMeans = { ...budgets, lcp_ms: 3200 };
    const variant: MetricMeans = { ...budgets, lcp_ms: 3000 }; // over budget, but better than baseline
    expect(checkV001BudgetBreach(alreadyOverBudget, variant, budgets)).toEqual([]);
  });

  it("does NOT fire when the variant is under budget even if worse than baseline", () => {
    const variant: MetricMeans = { ...budgets, tbt_ms: 250 }; // under the 300 budget
    const baselineBetter: MetricMeans = { ...budgets, tbt_ms: 100 };
    expect(checkV001BudgetBreach(baselineBetter, variant, budgets)).toEqual([]);
  });

  it("returns a single V001 entry even when multiple metrics breach simultaneously", () => {
    const variant: MetricMeans = { ...budgets, lcp_ms: 3000, tbt_ms: 999 };
    const baselineBetter: MetricMeans = { ...budgets, lcp_ms: 2000, tbt_ms: 100 };
    expect(checkV001BudgetBreach(baselineBetter, variant, budgets)).toEqual(["V001"]);
  });

  it("returns [] when the variant matches the baseline exactly", () => {
    expect(checkV001BudgetBreach(baseline, { ...baseline }, budgets)).toEqual([]);
  });
});

describe("metricMeans", () => {
  it("averages each raw metric across an arm", () => {
    const samples = [makeSample("variant", 0, { lcp_ms: 1000 }), makeSample("variant", 1, { lcp_ms: 3000 })];
    expect(metricMeans(samples).lcp_ms).toBe(2000);
  });

  it("returns zeros (not NaN) for an empty arm", () => {
    const means = metricMeans([]);
    expect(means.lcp_ms).toBe(0);
    expect(Number.isNaN(means.cls)).toBe(false);
  });
});

describe("evaluateVetoes (docs/REWARD.md §5, §8)", () => {
  it("returns [] for a clean experiment where nothing fires", () => {
    expect(evaluateVetoes(makeArm("baseline", 4), makeArm("variant", 4), looseBudgets)).toEqual([]);
  });

  describe("V001 BUDGET_BREACH", () => {
    it("fires when the variant breaches budget and is worse than baseline", () => {
      const base = makeArm("baseline", 4, { lcp_ms: 2000 });
      const variant = makeArm("variant", 4, { lcp_ms: 3000 });
      expect(evaluateVetoes(base, variant, { ...looseBudgets, lcp_ms: 2500 })).toContain("V001");
    });

    it("does NOT fire when the variant is under budget", () => {
      const base = makeArm("baseline", 4, { lcp_ms: 2000 });
      const variant = makeArm("variant", 4, { lcp_ms: 2400 });
      expect(evaluateVetoes(base, variant, { ...looseBudgets, lcp_ms: 2500 })).not.toContain("V001");
    });
  });

  describe("V002 A11Y_CONTRACT", () => {
    it("fires when the variant's run_index 0 sample has a11y violations", () => {
      const variant = makeArm("variant", 4);
      variant[0].flags.a11y_violations = 1;
      expect(evaluateVetoes(makeArm("baseline", 4), variant, looseBudgets)).toContain("V002");
    });

    it("does NOT fire when a11y violations appear only on a non-zero run_index", () => {
      // a11y is measured ONLY on run_index 0 (CONTRACTS §11.1); a nonzero
      // value elsewhere is not meaningful data and must not trigger a veto.
      const variant = makeArm("variant", 4);
      variant[2].flags.a11y_violations = 5;
      expect(evaluateVetoes(makeArm("baseline", 4), variant, looseBudgets)).not.toContain("V002");
    });

    it("does NOT fire when run_index 0 is clean", () => {
      expect(evaluateVetoes(makeArm("baseline", 4), makeArm("variant", 4), looseBudgets)).not.toContain("V002");
    });
  });

  describe("V003 HYDRATION_FAILURE", () => {
    it("fires at 2 affected variant samples (exceeding FLAKE_TOLERANCE = 1)", () => {
      const variant = makeArm("variant", 4);
      variant[0].flags.hydration_failures = 1;
      variant[1].flags.hydration_failures = 1;
      expect(evaluateVetoes(makeArm("baseline", 4), variant, looseBudgets)).toContain("V003");
    });

    it("does NOT fire at exactly 1 affected sample — a single flake is tolerated", () => {
      const variant = makeArm("variant", 4);
      variant[0].flags.hydration_failures = 3; // one sample, many failures
      expect(evaluateVetoes(makeArm("baseline", 4), variant, looseBudgets)).not.toContain("V003");
    });
  });

  describe("V004 RUNTIME_ERROR", () => {
    it("fires at 2 affected variant samples", () => {
      const variant = makeArm("variant", 4);
      variant[0].flags.runtime_errors = 1;
      variant[3].flags.runtime_errors = 2;
      expect(evaluateVetoes(makeArm("baseline", 4), variant, looseBudgets)).toContain("V004");
    });

    it("does NOT fire at exactly 1 affected sample", () => {
      const variant = makeArm("variant", 4);
      variant[0].flags.runtime_errors = 9;
      expect(evaluateVetoes(makeArm("baseline", 4), variant, looseBudgets)).not.toContain("V004");
    });
  });

  describe("V005 METRIC_COLLAPSE", () => {
    it("fires when a single metric's normalized score drops by more than 0.15", () => {
      // tbt_ms: GOOD 200, POOR 600. baseline 300 -> score 0.75;
      // variant 500 -> score 0.25. delta = -0.50 < -0.15.
      const base = makeArm("baseline", 4, { tbt_ms: 300 });
      const variant = makeArm("variant", 4, { tbt_ms: 500 });
      expect(evaluateVetoes(base, variant, looseBudgets)).toContain("V005");
    });

    it("does NOT fire for a drop clearly smaller than 0.15", () => {
      // tbt_ms range is 400ms wide, so 0.10 of score == 40ms.
      // baseline 300 -> 0.75; variant 340 -> 0.65. delta = -0.10.
      const base = makeArm("baseline", 4, { tbt_ms: 300 });
      const variant = makeArm("variant", 4, { tbt_ms: 340 });
      expect(evaluateVetoes(base, variant, looseBudgets)).not.toContain("V005");
    });

    it("fires at a nominally-exact -0.15 drop, because binary floating point lands just below the threshold", () => {
      // Pins real behavior at the boundary rather than the algebraic ideal.
      // baseline 300 -> 0.75 (exact in binary); variant 360 -> 0.6, whose
      // nearest double is 0.59999999999999997780. The difference is therefore
      // -0.15000000000000002220, which IS strictly less than the nearest
      // double to -0.15 (-0.14999999999999999445), so REWARD.md §5's literal
      // `< -0.15` fires.
      //
      // The implementation is deliberately kept literal — no epsilon
      // tolerance, since REWARD.md specifies none and inventing one would
      // change which experiments get vetoed. See docs/OPEN_QUESTIONS.md #14.
      const base = makeArm("baseline", 4, { tbt_ms: 300 });
      const variant = makeArm("variant", 4, { tbt_ms: 360 });
      expect(evaluateVetoes(base, variant, looseBudgets)).toContain("V005");
    });

    it("does NOT fire when the metric improves", () => {
      const base = makeArm("baseline", 4, { tbt_ms: 500 });
      const variant = makeArm("variant", 4, { tbt_ms: 300 });
      expect(evaluateVetoes(base, variant, looseBudgets)).not.toContain("V005");
    });

    it("fires even when overall reward improves — a collapse on one metric is not offset", () => {
      // tbt_ms collapses (0.75 -> 0.25, weighted 0.20 => -0.10 reward) while
      // lcp_ms improves to its best (0.5 -> 1.0, weighted 0.30 => +0.15).
      // Net reward is UP, but V005 must still fire.
      const base = makeArm("baseline", 4, { tbt_ms: 300, lcp_ms: 3250 });
      const variant = makeArm("variant", 4, { tbt_ms: 500, lcp_ms: 2500 });
      expect(evaluateVetoes(base, variant, looseBudgets)).toContain("V005");
    });
  });

  it("collects EVERY firing code, sorted ascending — never short-circuits on the first", () => {
    const base = makeArm("baseline", 4, { lcp_ms: 2000, tbt_ms: 300 });
    const variant = makeArm("variant", 4, { lcp_ms: 3000, tbt_ms: 500 });
    variant[0].flags.a11y_violations = 1;
    variant[0].flags.hydration_failures = 1;
    variant[1].flags.hydration_failures = 1;
    variant[0].flags.runtime_errors = 1;
    variant[1].flags.runtime_errors = 1;
    const codes = evaluateVetoes(base, variant, { ...looseBudgets, lcp_ms: 2500 });
    expect(codes).toEqual(["V001", "V002", "V003", "V004", "V005"]);
  });
});
