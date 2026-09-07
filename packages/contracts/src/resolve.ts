// Resolution per docs/CONTRACTS.md §5.4 (`resolve`, `makeBaselineProfile`,
// `applyProposal`) and §8.2 (tier-default budget merge).
//
// docs/decisions/02-reconciliation.md: the former packages/flags/resolve.ts
// also exported `resolveRoute()` / `ResolvedIslandPlacement`, invented to
// satisfy a prompt requirement with no frozen basis in CONTRACTS.md. Neither
// name appears in any frozen doc; both were discarded rather than migrated
// (docs/RECONCILIATION.md §C.1 flagged them as orphan identifiers).

import type {
  SiteConfig,
  RouteConfig,
  RouteBudgets,
  ResolvedRouteConfig,
  ResolvedSiteConfig,
  Tier,
  BuildProfile,
  Proposal,
} from "./types";
import { checkConstraints } from "./constraints";

// CONTRACTS.md §8.2 — canonical tier-default budget table.
const TIER_DEFAULTS: Record<Tier, RouteBudgets> = {
  critical: {
    lcp_ms: 1800,
    cls: 0.1,
    tbt_ms: 200,
    ttfb_ms: 500,
    js_bytes: 153600,
    html_bytes: 102400,
    hydration_ms: 200,
  },
  standard: {
    lcp_ms: 2500,
    cls: 0.1,
    tbt_ms: 300,
    ttfb_ms: 800,
    js_bytes: 256000,
    html_bytes: 153600,
    hydration_ms: 300,
  },
  deferred: {
    lcp_ms: 4000,
    cls: 0.25,
    tbt_ms: 600,
    ttfb_ms: 1800,
    js_bytes: 512000,
    html_bytes: 204800,
    hydration_ms: 500,
  },
};

function resolveRouteConfig(route: RouteConfig): ResolvedRouteConfig {
  const tier: Tier = route.tier ?? "standard";
  const budgets: RouteBudgets = { ...TIER_DEFAULTS[tier], ...(route.budgets ?? {}) };
  return { ...route, tier, budgets };
}

// CONTRACTS.md §5.4 — function resolve(config: SiteConfig): ResolvedSiteConfig
export function resolve(config: SiteConfig): ResolvedSiteConfig {
  return {
    schema_version: 1,
    site_id: config.site_id,
    routes: config.routes.map(resolveRouteConfig),
  };
}

// CONTRACTS.md §1.1 — <prefix>_<unix_ms>_<seq>, 13-digit epoch-ms, 4-digit
// zero-padded per-process counter starting "0000".
let profileSeq = 0;
function generateId(prefix: string): string {
  const unixMs = Date.now().toString().padStart(13, "0");
  const seq = (profileSeq++).toString().padStart(4, "0");
  return `${prefix}_${unixMs}_${seq}`;
}

// CONTRACTS.md §9.1 — function makeBaselineProfile(site): BuildProfile
export function makeBaselineProfile(site: ResolvedSiteConfig): BuildProfile {
  return {
    schema_version: 1,
    profile_id: generateId("bp"),
    site_id: site.site_id,
    created_at: new Date().toISOString(),
    source: { kind: "baseline" },
    routes: site.routes,
  };
}

// CONTRACTS.md §9.1 / §5.4 — function applyProposal(site, p): BuildProfile
// Re-runs combination checks on the mutated route; THROWS an Error whose
// message begins with the violated code if any C-code matches.
export function applyProposal(site: ResolvedSiteConfig, p: Proposal): BuildProfile {
  const routes = site.routes.map((route) => ({ ...route, islands: route.islands.map((i) => ({ ...i })) }));
  const route = routes.find((r) => r.route_id === p.target_route_id);
  if (!route) {
    throw new Error(`applyProposal: no route found for target_route_id "${p.target_route_id}"`);
  }

  const mutation = p.mutation;
  switch (mutation.kind) {
    case "set_hydration": {
      const island = route.islands.find((i) => i.island_id === mutation.island_id);
      if (!island) throw new Error(`applyProposal: no island "${mutation.island_id}" on route "${route.route_id}"`);
      island.hydration = mutation.value;
      break;
    }
    case "set_renderer": {
      const island = route.islands.find((i) => i.island_id === mutation.island_id);
      if (!island) throw new Error(`applyProposal: no island "${mutation.island_id}" on route "${route.route_id}"`);
      island.renderer = mutation.value;
      break;
    }
    case "set_render_mode": {
      route.render_mode = mutation.value;
      break;
    }
    case "set_data_strategy": {
      if (route.data_strategy === "none") {
        throw new Error(
          `applyProposal: route "${route.route_id}" has data_strategy "none" — no data file exists to serve a new strategy`,
        );
      }
      route.data_strategy = mutation.value;
      if (mutation.value === "none") {
        route.data_url = null;
      }
      break;
    }
  }

  for (const island of route.islands) {
    const codes = checkConstraints({
      renderer: island.renderer,
      hydration: island.hydration,
      render_mode: route.render_mode,
      data_strategy: route.data_strategy,
    });
    if (codes.length > 0) {
      throw new Error(`${codes[0]}: applyProposal produced an illegal placement on island "${island.island_id}"`);
    }
  }

  return {
    schema_version: 1,
    profile_id: generateId("bp"),
    site_id: site.site_id,
    created_at: new Date().toISOString(),
    source: { kind: "proposal", proposal_id: p.proposal_id },
    routes,
  };
}
