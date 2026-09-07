// Types transcribed verbatim from docs/CONTRACTS.md (FROZEN). Field shapes
// here must match CONTRACTS.md exactly; CONTRACTS.md is the source of truth.
//
// Scope note (docs/decisions/02-reconciliation.md): this is not yet the full
// transcription CONTRACTS.md §15 asks for ("every type/interface declaration
// in this document"). It covers the configuration-layer subset migrated from
// the former packages/flags/, plus VetoCode (needed by packages/reward's
// V001 veto check). The remaining types are added by whichever stage first
// needs them.

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// CONTRACTS.md §2 — closed vocabularies
export type Renderer = "react" | "preact" | "svelte" | "vanilla";

export type Hydration = "none" | "load" | "idle" | "visible" | "interaction";

export type RenderMode = "static" | "server" | "client";

export type DataStrategy = "none" | "static" | "request" | "client";

export type Tier = "critical" | "standard" | "deferred";

export type VetoCode = "V001" | "V002" | "V003" | "V004" | "V005";

export type PropType = "string" | "number" | "boolean" | "string[]" | "number[]" | "json";

export type AriaRole = "button" | "link" | "navigation" | "region" | "dialog" | "list" | "form" | "img" | "none";

export type KeyboardInteraction = "activate" | "dismiss" | "navigate";

export type FocusBehavior = "none" | "self" | "trap";

export type Arm = "baseline" | "variant" | "scan";

// Canonical order (CONTRACTS.md §2): lcp_ms, cls, tbt_ms, ttfb_ms,
// js_bytes, html_bytes, hydration_ms. Wherever metrics are iterated or
// arrays are ordered, that order is normative.
export type MetricName = "lcp_ms" | "cls" | "tbt_ms" | "ttfb_ms" | "js_bytes" | "html_bytes" | "hydration_ms";

export type Verdict = "accept" | "reject" | "veto" | "inconclusive";

export type KBDirection = "improves" | "regresses" | "neutral";

export type KBSource = "measured" | "seeded";

export type KBStatus = "active" | "superseded";

// CONTRACTS.md §3.1
export interface SiteConfig {
  schema_version: 1;
  site_id: string;
  routes: RouteConfig[];
}

// CONTRACTS.md §3.2
export interface RouteConfig {
  route_id: string;
  path: string;
  title: string;
  tier?: Tier; // DEFAULT: "standard"
  render_mode: RenderMode;
  data_strategy: DataStrategy;
  data_url: string | null;
  budgets?: Partial<RouteBudgets>; // DEFAULT: {} — filled from tier defaults
  islands: IslandConfig[];
}

// CONTRACTS.md §3.3
export interface IslandConfig {
  island_id: string;
  contract_id: string;
  renderer: Renderer;
  hydration: Hydration;
  props: Record<string, JsonValue>;
}

// CONTRACTS.md §8.1
export interface RouteBudgets {
  lcp_ms: number;
  cls: number;
  tbt_ms: number;
  ttfb_ms: number;
  js_bytes: number;
  html_bytes: number;
  hydration_ms: number;
}

// CONTRACTS.md §3.4
export interface ResolvedRouteConfig extends RouteConfig {
  tier: Tier;
  budgets: RouteBudgets;
}

export interface ResolvedSiteConfig {
  schema_version: 1;
  site_id: string;
  routes: ResolvedRouteConfig[];
}

// CONTRACTS.md §5.1
export interface ValidationError {
  code: ErrorCode;
  pointer: string;
  message: string;
}

export type ErrorCode =
  // combination constraints (§4)
  | "C001"
  | "C002"
  | "C003"
  | "C004"
  | "C005"
  // structural constraints (§5.2)
  | "S001"
  | "S002"
  | "S003"
  | "S004"
  | "S005"
  | "S006"
  | "S007"
  | "S008"
  | "S009"
  | "S010"
  | "S011"
  | "S012"
  | "S013"
  | "S014"
  | "S015"
  | "S016"
  | "S017"
  | "S018"
  // registry constraints (§7.4)
  | "R001"
  | "R002";

// CONTRACTS.md §6.1
export interface PropSpec {
  name: string;
  type: PropType;
  required: boolean;
  default: JsonValue | null; // MUST be null when required = true
}

export interface EventSpec {
  name: string;
  payload: PropType | "void";
}

export interface A11ySpec {
  role: AriaRole;
  label: { source: "static"; value: string } | { source: "prop"; prop: string };
  keyboard: KeyboardInteraction[];
  focus: FocusBehavior;
}

export interface IslandContract {
  contract_id: string;
  props: PropSpec[];
  events: EventSpec[];
  a11y: A11ySpec;
}

// CONTRACTS.md §6.5
export interface ContractsFile {
  schema_version: 1;
  contracts: IslandContract[];
}

// CONTRACTS.md §9.1
export interface BuildProfile {
  schema_version: 1;
  profile_id: string; // bp_… (§1.1)
  site_id: string;
  created_at: string; // §1.2
  source: { kind: "baseline" } | { kind: "proposal"; proposal_id: string };
  routes: ResolvedRouteConfig[]; // ALL routes, fully resolved
}

// CONTRACTS.md §10
export type Mutation =
  | { kind: "set_hydration"; route_id: string; island_id: string; value: Hydration }
  | { kind: "set_renderer"; route_id: string; island_id: string; value: Renderer }
  | { kind: "set_render_mode"; route_id: string; value: RenderMode }
  | { kind: "set_data_strategy"; route_id: string; value: DataStrategy };

export type ProposalStatus = "pending" | "testing" | "accepted" | "rejected" | "vetoed" | "inconclusive";

export interface Proposal {
  schema_version: 1;
  proposal_id: string; // pr_…
  created_at: string;
  target_route_id: string; // equals mutation.route_id
  mutation: Mutation; // exactly ONE mutation per proposal
  rationale_kb_ids: string[]; // may be []
  status: ProposalStatus;
}

// CONTRACTS.md §11.1
export interface MetricValues {
  lcp_ms: number; // ≥ 0
  cls: number; // ≥ 0
  tbt_ms: number; // ≥ 0
  ttfb_ms: number; // ≥ 0
  js_bytes: number; // ≥ 0, integer
  html_bytes: number; // ≥ 0, integer
  hydration_ms: number; // ≥ 0
}

export interface SampleFlags {
  hydration_failures: number; // islands in status "error" or not "ready" at collection
  runtime_errors: number; // __HARNESS__.error_count at collection
  a11y_violations: number; // §6.2 check failures; MEASURED ONLY on run_index 0
}

export interface MeasurementSample {
  schema_version: 1;
  sample_id: string; // sm_…
  profile_id: string;
  route_id: string;
  arm: Arm;
  run_index: number; // 0-based within (profile_id, route_id, arm)
  collected_at: string;
  metrics: MetricValues;
  flags: SampleFlags;
}

// CONTRACTS.md §12
export interface MetricComparison {
  metric: MetricName;
  baseline_mean: number; // mean of raw metric over baseline samples
  variant_mean: number;
  baseline_score: number; // normalization (REWARD.md §2) applied to the mean
  variant_score: number;
  score_delta: number; // variant_score − baseline_score
}

export interface ExperimentResult {
  schema_version: 1;
  experiment_id: string; // ex_…
  proposal_id: string;
  target_route_id: string;
  baseline_profile_id: string;
  variant_profile_id: string;
  n_per_arm: number; // N_PER_ARM in production; tests may override
  started_at: string;
  completed_at: string;
  metric_comparisons: MetricComparison[]; // length 7, canonical MetricName order
  reward_baseline_mean: number; // mean per-sample reward (REWARD.md §3)
  reward_baseline_sd: number; // sample SD (n−1 denominator)
  reward_variant_mean: number;
  reward_variant_sd: number;
  reward_delta: number; // variant_mean − baseline_mean
  z_statistic: number; // REWARD.md §7
  verdict: Verdict;
  veto_codes: VetoCode[]; // non-empty iff verdict = "veto"; sorted asc
}

// CONTRACTS.md §13.1 — null means "any". A scope APPLIES to a query iff
// every non-null field equals the corresponding query field. SPECIFICITY is
// the count of non-null fields (0–5).
export interface KBScope {
  route_id: string | null;
  renderer: Renderer | null;
  hydration: Hydration | null;
  render_mode: RenderMode | null;
  data_strategy: DataStrategy | null;
}

// CONTRACTS.md §13.2
export interface KBClaim {
  direction: KBDirection; // effect on per-sample reward (REWARD.md §3)
  reward_delta: number; // measured delta; 0 allowed; sign matches direction
  vetoed: boolean; // true iff the source experiment verdict was "veto"
}

// CONTRACTS.md §13.3
export interface KBRecord {
  schema_version: 1;
  kb_id: string; // kb_…
  created_at: string;
  scope: KBScope;
  claim: KBClaim;
  evidence: {
    experiment_id: string | null; // null iff source = "seeded"
    sample_size: number; // samples per arm; 0 iff source = "seeded"
  };
  source: KBSource;
  status: KBStatus;
}

export interface KBFile {
  schema_version: 1;
  records: KBRecord[];
}
