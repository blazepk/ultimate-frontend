// Test-only fixture builders. Not part of @harness/kb's public surface
// (docs/PUBLIC_API.md) — deliberately not re-exported from index.ts.

import type {
  ExperimentResult,
  KBRecord,
  KBScope,
  MeasurementSample,
  MetricValues,
  Mutation,
  Proposal,
  Verdict,
} from "@harness/contracts";

export const EMPTY_SCOPE: KBScope = {
  route_id: null,
  renderer: null,
  hydration: null,
  render_mode: null,
  data_strategy: null,
};

export function makeRecord(overrides: Partial<KBRecord> = {}): KBRecord {
  return {
    schema_version: 1,
    kb_id: "kb_1700000000000_0000",
    created_at: "2026-01-01T00:00:00.000Z",
    scope: { ...EMPTY_SCOPE },
    claim: { direction: "improves", reward_delta: 0.01, vetoed: false },
    evidence: { experiment_id: "ex_1700000000000_0000", sample_size: 91 },
    source: "measured",
    status: "active",
    ...overrides,
  };
}

export function makeResult(verdict: Verdict, overrides: Partial<ExperimentResult> = {}): ExperimentResult {
  return {
    schema_version: 1,
    experiment_id: "ex_1700000000000_0000",
    proposal_id: "pr_1700000000000_0000",
    target_route_id: "home",
    baseline_profile_id: "bp_1700000000000_0000",
    variant_profile_id: "bp_1700000000000_0001",
    n_per_arm: 91,
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: "2026-01-01T01:00:00.000Z",
    metric_comparisons: [],
    reward_baseline_mean: 0.5,
    reward_baseline_sd: 0.01,
    reward_variant_mean: 0.53,
    reward_variant_sd: 0.01,
    reward_delta: 0.03,
    z_statistic: verdict === "accept" ? 5 : verdict === "reject" ? -5 : 0,
    verdict,
    veto_codes: verdict === "veto" ? ["V002"] : [],
    ...overrides,
  };
}

export function makeProposal(mutation: Mutation, overrides: Partial<Proposal> = {}): Proposal {
  return {
    schema_version: 1,
    proposal_id: "pr_1700000000000_0000",
    created_at: "2026-01-01T00:00:00.000Z",
    target_route_id: mutation.route_id,
    mutation,
    rationale_kb_ids: [],
    status: "pending",
    ...overrides,
  };
}

// Every metric mid-range, so reward is 0.5 and a single metric can be moved
// in either direction without hitting a clamp.
const MID_METRICS: MetricValues = {
  lcp_ms: 3250,
  cls: 0.175,
  tbt_ms: 400,
  ttfb_ms: 1300,
  js_bytes: 230400,
  html_bytes: 128000,
  hydration_ms: 250,
};

export function makeScanSample(route_id: string, run_index: number, metrics: Partial<MetricValues> = {}): MeasurementSample {
  return {
    schema_version: 1,
    sample_id: `sm_1700000000000_${String(run_index).padStart(4, "0")}`,
    profile_id: "bp_1700000000000_0000",
    route_id,
    arm: "scan",
    run_index,
    collected_at: "2026-01-01T00:00:00.000Z",
    metrics: { ...MID_METRICS, ...metrics },
    flags: { hydration_failures: 0, runtime_errors: 0, a11y_violations: 0 },
  };
}

// A scan where `worstRouteId` scores strictly lowest, so target selection is
// unambiguous. lcp_ms 4000 -> score 0 (reward 0.35); 2500 -> score 1 (0.65).
export function makeScan(routeIds: string[], worstRouteId: string): MeasurementSample[] {
  return routeIds.flatMap((route_id, i) =>
    [0, 1].map((run_index) =>
      makeScanSample(route_id, i * 2 + run_index, { lcp_ms: route_id === worstRouteId ? 4000 : 2500 }),
    ),
  );
}
