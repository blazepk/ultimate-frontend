import { describe, it, expect } from "vitest";
import { resolve, makeBaselineProfile, applyProposal } from "./resolve";
import { checkConstraints } from "./constraints";
import type { SiteConfig, Renderer, Hydration, RenderMode, DataStrategy, Proposal } from "./types";

const referenceConfig: SiteConfig = {
  schema_version: 1,
  site_id: "reference",
  routes: [
    {
      route_id: "home",
      path: "/",
      title: "Home",
      tier: "critical",
      render_mode: "static",
      data_strategy: "none",
      data_url: null,
      islands: [
        { island_id: "nav", contract_id: "nav-menu", renderer: "preact", hydration: "load", props: {} },
        { island_id: "hero", contract_id: "hero-cta", renderer: "react", hydration: "idle", props: {} },
      ],
    },
    {
      route_id: "catalog",
      path: "/catalog",
      title: "Catalog",
      // tier omitted -> defaults to "standard"
      render_mode: "server",
      data_strategy: "request",
      data_url: "./fixtures/catalog.json",
      islands: [{ island_id: "table", contract_id: "data-table", renderer: "svelte", hydration: "visible", props: {} }],
    },
  ],
};

describe("resolve (docs/CONTRACTS.md §5.4)", () => {
  it('fills the default tier ("standard") when omitted', () => {
    const resolved = resolve(referenceConfig);
    expect(resolved.routes[1].tier).toBe("standard");
  });

  it("fills tier-default budgets when route.budgets is omitted (docs/CONTRACTS.md §8.2)", () => {
    const resolved = resolve(referenceConfig);
    const home = resolved.routes[0];
    expect(home.tier).toBe("critical");
    expect(home.budgets).toEqual({
      lcp_ms: 1800,
      cls: 0.1,
      tbt_ms: 200,
      ttfb_ms: 500,
      js_bytes: 153600,
      html_bytes: 102400,
      hydration_ms: 200,
    });
  });

  it("merges provided budget overrides key-by-key over the tier defaults", () => {
    const config: SiteConfig = {
      ...referenceConfig,
      routes: [{ ...referenceConfig.routes[0], budgets: { lcp_ms: 1000 } }, referenceConfig.routes[1]],
    };
    const resolved = resolve(config);
    expect(resolved.routes[0].budgets.lcp_ms).toBe(1000);
    expect(resolved.routes[0].budgets.cls).toBe(0.1); // untouched key still from tier default
  });

  it("property: any config whose every island placement passes the constraint validator resolves without throwing", () => {
    const renderers: Renderer[] = ["react", "preact", "svelte", "vanilla"];
    const hydrations: Hydration[] = ["none", "load", "idle", "visible", "interaction"];
    const renderModes: RenderMode[] = ["static", "server", "client"];
    const dataStrategies: DataStrategy[] = ["none", "static", "request", "client"];

    let legalCount = 0;
    for (const renderer of renderers) {
      for (const hydration of hydrations) {
        for (const render_mode of renderModes) {
          for (const data_strategy of dataStrategies) {
            const tuple = { renderer, hydration, render_mode, data_strategy };
            if (checkConstraints(tuple).length > 0) continue; // only configs the validator passes
            legalCount++;
            const config: SiteConfig = {
              schema_version: 1,
              site_id: "prop-test",
              routes: [
                {
                  route_id: "r",
                  path: "/",
                  title: "R",
                  render_mode,
                  data_strategy,
                  data_url: data_strategy === "none" ? null : "./fixtures/x.json",
                  islands: [{ island_id: "i", contract_id: "c", renderer, hydration, props: {} }],
                },
              ],
            };
            expect(() => resolve(config)).not.toThrow();
          }
        }
      }
    }
    // CONTRACTS.md §4.2: 180 of the 240 tuples are legal.
    expect(legalCount).toBe(180);
  });
});

describe("makeBaselineProfile (docs/CONTRACTS.md §9.1)", () => {
  it("copies the resolved site unchanged into a baseline-sourced profile", () => {
    const resolved = resolve(referenceConfig);
    const profile = makeBaselineProfile(resolved);
    expect(profile.schema_version).toBe(1);
    expect(profile.site_id).toBe("reference");
    expect(profile.source).toEqual({ kind: "baseline" });
    expect(profile.routes).toEqual(resolved.routes);
    expect(profile.profile_id).toMatch(/^bp_\d{13}_\d{4}$/);
  });
});

describe("applyProposal (docs/CONTRACTS.md §9.1, §5.4)", () => {
  const resolved = resolve(referenceConfig);

  it("applies a set_hydration mutation to the target island and re-checks constraints", () => {
    const proposal: Proposal = {
      schema_version: 1,
      proposal_id: "pr_0000000000001_0000",
      created_at: new Date().toISOString(),
      target_route_id: "home",
      mutation: { kind: "set_hydration", route_id: "home", island_id: "hero", value: "visible" },
      rationale_kb_ids: [],
      status: "pending",
    };
    const profile = applyProposal(resolved, proposal);
    expect(profile.source).toEqual({ kind: "proposal", proposal_id: "pr_0000000000001_0000" });
    const home = profile.routes.find((r) => r.route_id === "home")!;
    expect(home.islands.find((i) => i.island_id === "hero")!.hydration).toBe("visible");
    // original resolved site is untouched
    expect(resolved.routes.find((r) => r.route_id === "home")!.islands.find((i) => i.island_id === "hero")!.hydration).toBe(
      "idle",
    );
  });

  it("throws an error whose message begins with the violated C-code when the mutation is illegal", () => {
    // catalog's route_id="catalog" render_mode="server", data_strategy="request" — set_render_mode to
    // "client" makes data_strategy=request+render_mode=client illegal (C002), and hydration="visible" for
    // "table" combined with render_mode="client" is legal (not "none"), so only C002 should fire.
    const proposal: Proposal = {
      schema_version: 1,
      proposal_id: "pr_0000000000002_0000",
      created_at: new Date().toISOString(),
      target_route_id: "catalog",
      mutation: { kind: "set_render_mode", route_id: "catalog", value: "client" },
      rationale_kb_ids: [],
      status: "pending",
    };
    expect(() => applyProposal(resolved, proposal)).toThrow(/^C002/);
  });

  it("set_data_strategy to \"none\" also nulls the route's data_url", () => {
    const proposal: Proposal = {
      schema_version: 1,
      proposal_id: "pr_0000000000003_0000",
      created_at: new Date().toISOString(),
      target_route_id: "catalog",
      mutation: { kind: "set_data_strategy", route_id: "catalog", value: "none" },
      rationale_kb_ids: [],
      status: "pending",
    };
    const profile = applyProposal(resolved, proposal);
    const catalog = profile.routes.find((r) => r.route_id === "catalog")!;
    expect(catalog.data_strategy).toBe("none");
    expect(catalog.data_url).toBeNull();
  });

  it("set_data_strategy on a route already \"none\" throws", () => {
    const proposal: Proposal = {
      schema_version: 1,
      proposal_id: "pr_0000000000004_0000",
      created_at: new Date().toISOString(),
      target_route_id: "home",
      mutation: { kind: "set_data_strategy", route_id: "home", value: "static" },
      rationale_kb_ids: [],
      status: "pending",
    };
    expect(() => applyProposal(resolved, proposal)).toThrow();
  });

  it("throws when the target route does not exist", () => {
    const proposal: Proposal = {
      schema_version: 1,
      proposal_id: "pr_0000000000005_0000",
      created_at: new Date().toISOString(),
      target_route_id: "does-not-exist",
      mutation: { kind: "set_render_mode", route_id: "does-not-exist", value: "static" },
      rationale_kb_ids: [],
      status: "pending",
    };
    expect(() => applyProposal(resolved, proposal)).toThrow();
  });
});
