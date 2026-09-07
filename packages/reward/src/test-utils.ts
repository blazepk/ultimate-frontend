// Test-only helpers for constructing MeasurementSample fixtures. Not part
// of @harness/engine's public surface (docs/PUBLIC_API.md) — not re-exported
// from index.ts.

import type { Arm, MeasurementSample, MetricValues, SampleFlags } from "@harness/contracts";

// Metrics that normalize to a mid-range score on every metric, so a test can
// move one metric in either direction without hitting a clamp.
export const MID_METRICS: MetricValues = {
  lcp_ms: 3250, // score 0.5
  cls: 0.175, // score 0.5
  tbt_ms: 400, // score 0.5
  ttfb_ms: 1300, // score 0.5
  js_bytes: 230400, // score 0.5
  html_bytes: 128000, // score 0.5
  hydration_ms: 250, // score 0.5
};

export const CLEAN_FLAGS: SampleFlags = {
  hydration_failures: 0,
  runtime_errors: 0,
  a11y_violations: 0,
};

export function makeSample(
  arm: Arm,
  run_index: number,
  metrics: Partial<MetricValues> = {},
  flags: Partial<SampleFlags> = {},
): MeasurementSample {
  return {
    schema_version: 1,
    sample_id: `sm_${String(1700000000000 + run_index).padStart(13, "0")}_${String(run_index).padStart(4, "0")}`,
    profile_id: arm === "baseline" ? "bp_1700000000000_0000" : "bp_1700000000000_0001",
    route_id: "home",
    arm,
    run_index,
    collected_at: "2026-01-01T00:00:00.000Z",
    metrics: { ...MID_METRICS, ...metrics },
    flags: { ...CLEAN_FLAGS, ...flags },
  };
}

export function makeArm(
  arm: Arm,
  n: number,
  metrics: Partial<MetricValues> = {},
  flags: Partial<SampleFlags> = {},
): MeasurementSample[] {
  return Array.from({ length: n }, (_, i) => makeSample(arm, i, metrics, flags));
}
