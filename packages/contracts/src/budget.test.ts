import { describe, it, expect } from "vitest";
import { checkBudget } from "./budget";
import type { RouteBudgets } from "./types";

const budgets: RouteBudgets = {
  lcp_ms: 2500,
  cls: 0.1,
  tbt_ms: 300,
  ttfb_ms: 800,
  js_bytes: 256000,
  html_bytes: 153600,
  hydration_ms: 300,
};

describe("checkBudget (docs/CONTRACTS.md §8.1)", () => {
  it("passes when every mean is at or under its budget", () => {
    const result = checkBudget({ ...budgets }, budgets);
    expect(result).toEqual({ pass: true, breaching_fields: [] });
  });

  it("fails and names the single breaching field", () => {
    const means = { ...budgets, lcp_ms: 3000 };
    const result = checkBudget(means, budgets);
    expect(result.pass).toBe(false);
    expect(result.breaching_fields).toEqual(["lcp_ms"]);
  });

  it("reports every breaching field, in canonical metric order, when more than one breaches", () => {
    const means = { ...budgets, tbt_ms: 999, cls: 0.9 };
    const result = checkBudget(means, budgets);
    expect(result.pass).toBe(false);
    expect(result.breaching_fields).toEqual(["cls", "tbt_ms"]);
  });

  it("treats a mean exactly equal to the budget as passing (budget is the maximum acceptable mean)", () => {
    const result = checkBudget({ ...budgets }, budgets);
    expect(result.pass).toBe(true);
  });
});
