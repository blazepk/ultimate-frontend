// Deterministic proposal generation, per docs/CONTRACTS.md §14.
//
// The six steps are implemented verbatim and in order. Determinism is the
// point: identical inputs must always produce the identical proposal, which
// is why every iteration below uses a fixed canonical order and every
// tiebreak is explicit (ADR-0009 — one mutation per proposal, so the outcome
// of an experiment attributes to exactly one dimension).

import { validate } from "@harness/contracts";
import type {
  DataStrategy,
  Hydration,
  IslandConfig,
  IslandContract,
  KBFile,
  KBRecord,
  MeasurementSample,
  Mutation,
  Proposal,
  RenderMode,
  Renderer,
  ResolvedRouteConfig,
  ResolvedSiteConfig,
  SiteConfig,
} from "@harness/contracts";
import { validateWithContracts } from "@harness/islands";
import { sampleReward } from "@harness/engine";
import { precedes, query } from "../precedence";

// Canonical enum orders — CONTRACTS §2 declaration order, normative for
// mutation enumeration (§14 step 2).
const HYDRATIONS: readonly Hydration[] = ["none", "load", "idle", "visible", "interaction"];
const RENDERERS: readonly Renderer[] = ["react", "preact", "svelte", "vanilla"];
const RENDER_MODES: readonly RenderMode[] = ["static", "server", "client"];
const DATA_STRATEGIES: readonly DataStrategy[] = ["none", "static", "request", "client"];

// CONTRACTS §1.1 — <prefix>_<unix_ms>_<seq>.
let idSeq = 0;
function generateId(prefix: string): string {
  const unixMs = Date.now().toString().padStart(13, "0");
  const seq = (idSeq++).toString().padStart(4, "0");
  return `${prefix}_${unixMs}_${seq}`;
}

interface Candidate {
  mutation: Mutation;
  /** The island the mutation targets, or null for route-scoped mutations. */
  island: IslandConfig | null;
}

function contractOf(contracts: IslandContract[], contractId: string): IslandContract | undefined {
  return contracts.find((c) => c.contract_id === contractId);
}

function requiresData(contract: IslandContract | undefined): boolean {
  return contract?.props.some((p) => p.name === "data" && p.required) ?? false;
}

// Step 1 — target selection: lowest mean per-sample reward over the route's
// scan samples; ties broken by lexicographically smallest route_id.
//
// Routes with NO scan samples are skipped rather than treated as score 0.
// CONTRACTS §14 says to compute a mean "over its scan samples"; with none
// there is no mean, and targeting an unmeasured route would optimize
// something never observed.
function selectTargetRoute(site: ResolvedSiteConfig, scan: MeasurementSample[]): ResolvedRouteConfig | null {
  const scored: { route: ResolvedRouteConfig; mean: number }[] = [];
  for (const route of site.routes) {
    const samples = scan.filter((s) => s.route_id === route.route_id);
    if (samples.length === 0) continue;
    const mean = samples.reduce((sum, s) => sum + sampleReward(s.metrics), 0) / samples.length;
    scored.push({ route, mean });
  }
  if (scored.length === 0) return null;

  let best = scored[0];
  for (const entry of scored.slice(1)) {
    if (entry.mean < best.mean || (entry.mean === best.mean && entry.route.route_id < best.route.route_id)) {
      best = entry;
    }
  }
  return best.route;
}

// Step 2 — candidate enumeration, in exactly this order: dimensions
// [set_hydration, set_renderer, set_render_mode, set_data_strategy]; for
// island-scoped kinds, the target route's islands in CONFIG ORDER, then the
// dimension's enum values in canonical order, skipping the current value.
function enumerateCandidates(route: ResolvedRouteConfig): Candidate[] {
  const candidates: Candidate[] = [];

  for (const island of route.islands) {
    for (const value of HYDRATIONS) {
      if (value === island.hydration) continue;
      candidates.push({
        mutation: { kind: "set_hydration", route_id: route.route_id, island_id: island.island_id, value },
        island,
      });
    }
  }

  for (const island of route.islands) {
    for (const value of RENDERERS) {
      if (value === island.renderer) continue;
      candidates.push({
        mutation: { kind: "set_renderer", route_id: route.route_id, island_id: island.island_id, value },
        island,
      });
    }
  }

  for (const value of RENDER_MODES) {
    if (value === route.render_mode) continue;
    candidates.push({ mutation: { kind: "set_render_mode", route_id: route.route_id, value }, island: null });
  }

  for (const value of DATA_STRATEGIES) {
    if (value === route.data_strategy) continue;
    candidates.push({ mutation: { kind: "set_data_strategy", route_id: route.route_id, value }, island: null });
  }

  return candidates;
}

// Applies a candidate mutation to a deep copy of the site, mirroring
// `applyProposal`'s data_url normalization (CONTRACTS §9.1) so the copy is
// internally consistent before validation runs against it.
function applyMutationToCopy(site: ResolvedSiteConfig, mutation: Mutation): ResolvedSiteConfig {
  const copy = structuredClone(site) as ResolvedSiteConfig;
  const route = copy.routes.find((r) => r.route_id === mutation.route_id);
  if (!route) return copy;

  switch (mutation.kind) {
    case "set_hydration": {
      const island = route.islands.find((i) => i.island_id === mutation.island_id);
      if (island) island.hydration = mutation.value;
      break;
    }
    case "set_renderer": {
      const island = route.islands.find((i) => i.island_id === mutation.island_id);
      if (island) island.renderer = mutation.value;
      break;
    }
    case "set_render_mode":
      route.render_mode = mutation.value;
      break;
    case "set_data_strategy":
      route.data_strategy = mutation.value;
      if (mutation.value === "none") route.data_url = null;
      break;
  }
  return copy;
}

// Step 3 — legality filter. Drops a candidate if the mutated site would
// report any C-code (C001–C005) or S011/S012/S013. The rules are NOT
// re-derived here: `validate` (@harness/contracts) and
// `validateWithContracts` (@harness/islands) are called and their codes
// inspected, so the constraint table has exactly one implementation.
function isLegal(
  site: ResolvedSiteConfig,
  candidate: Candidate,
  contracts: IslandContract[],
  targetRoute: ResolvedRouteConfig,
): boolean {
  const mutation = candidate.mutation;

  if (mutation.kind === "set_data_strategy") {
    // A mutation FROM "none" is always dropped: no data_url exists on the
    // route, so nothing could serve the new strategy. (validate() would also
    // catch this as S011, but §14 step 3 states the rule directly.)
    if (targetRoute.data_strategy === "none") return false;
    // A mutation TO "none" is legal only if no island on the route requires
    // `data`. (Also S013, below — stated explicitly for the same reason.)
    if (mutation.value === "none") {
      const anyIslandNeedsData = targetRoute.islands.some((i) => requiresData(contractOf(contracts, i.contract_id)));
      if (anyIslandNeedsData) return false;
    }
  }

  const mutated = applyMutationToCopy(site, mutation);
  const codes = [
    ...validate(mutated).map((e) => e.code),
    ...validateWithContracts(mutated as SiteConfig, contracts).map((e) => e.code),
  ];
  return !codes.some((code) => code.startsWith("C") || code === "S011" || code === "S012" || code === "S013");
}

// Step 4 — KB filter. Builds the query from the target route plus the
// POST-MUTATION placement tuple of the affected island.
//
// For route-scoped mutations every island is evaluated and the
// highest-precedence winner among the per-island winners is taken (ties per
// §13.5's `precedes`). An islandless route queries with route fields set and
// renderer/hydration null — a scope with non-null island fields will then not
// apply, per §13.1.
function winningRecord(
  kb: KBFile,
  targetRoute: ResolvedRouteConfig,
  candidate: Candidate,
  mutatedRoute: ResolvedRouteConfig,
): KBRecord | null {
  const routeFields = {
    route_id: targetRoute.route_id,
    render_mode: mutatedRoute.render_mode,
    data_strategy: mutatedRoute.data_strategy,
  };

  if (candidate.island !== null) {
    const mutatedIsland = mutatedRoute.islands.find((i) => i.island_id === candidate.island!.island_id);
    if (!mutatedIsland) return null;
    return query(kb.records, {
      ...routeFields,
      renderer: mutatedIsland.renderer,
      hydration: mutatedIsland.hydration,
    });
  }

  if (mutatedRoute.islands.length === 0) {
    return query(kb.records, routeFields);
  }

  let winner: KBRecord | null = null;
  for (const island of mutatedRoute.islands) {
    const perIsland = query(kb.records, {
      ...routeFields,
      renderer: island.renderer,
      hydration: island.hydration,
    });
    if (perIsland === null) continue;
    if (winner === null || precedes(perIsland, winner)) winner = perIsland;
  }
  return winner;
}

// CONTRACTS §14 — function propose(opts): Proposal | null
export function propose(opts: {
  site: ResolvedSiteConfig;
  contracts: IslandContract[];
  kb: KBFile;
  scan: MeasurementSample[];
}): Proposal | null {
  // Step 1
  const targetRoute = selectTargetRoute(opts.site, opts.scan);
  if (targetRoute === null) return null;

  // Step 2
  const candidates = enumerateCandidates(targetRoute);

  // Step 3 + Step 4
  const surviving: { candidate: Candidate; record: KBRecord | null }[] = [];
  for (const candidate of candidates) {
    if (!isLegal(opts.site, candidate, opts.contracts, targetRoute)) continue;

    const mutated = applyMutationToCopy(opts.site, candidate.mutation);
    const mutatedRoute = mutated.routes.find((r) => r.route_id === targetRoute.route_id);
    if (!mutatedRoute) continue;

    const record = winningRecord(opts.kb, targetRoute, candidate, mutatedRoute);
    if (record !== null && record.claim.direction === "regresses") continue;

    surviving.push({ candidate, record });
  }

  if (surviving.length === 0) return null;

  // Step 5 — "improves"-winning candidates first, ordered by that record's
  // reward_delta DESCENDING; ties fall back to enumeration order, which
  // Array.prototype.sort preserves (stable since ES2019 / guaranteed in
  // Node 20). Everything else follows in enumeration order.
  const improves = surviving.filter((s) => s.record?.claim.direction === "improves");
  const rest = surviving.filter((s) => s.record?.claim.direction !== "improves");
  improves.sort((a, b) => (b.record?.claim.reward_delta ?? 0) - (a.record?.claim.reward_delta ?? 0));
  const ranked = [...improves, ...rest];

  // Step 6
  const chosen = ranked[0];
  return {
    schema_version: 1,
    proposal_id: generateId("pr"),
    created_at: new Date().toISOString(),
    target_route_id: targetRoute.route_id,
    mutation: chosen.candidate.mutation,
    rationale_kb_ids: chosen.record !== null ? [chosen.record.kb_id] : [],
    status: "pending",
  };
}
