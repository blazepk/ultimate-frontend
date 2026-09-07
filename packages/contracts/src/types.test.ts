import { describe, it, expect } from "vitest";
import type {
  SiteConfig,
  RouteConfig,
  IslandConfig,
  ResolvedRouteConfig,
  ValidationError,
  JsonValue,
  VetoCode,
} from "./types";

describe("types (docs/CONTRACTS.md §§1.3, 2, 3, 5.1)", () => {
  it("accepts a valid SiteConfig matching the Appendix A.2 shape", () => {
    const config: SiteConfig = {
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
            {
              island_id: "hero",
              contract_id: "hero-cta",
              renderer: "react",
              hydration: "idle",
              props: { heading: "Welcome", cta_label: "Get started" },
            },
          ],
        },
      ],
    };

    expect(config.routes).toHaveLength(1);
    expect(config.routes[0].islands[0].renderer).toBe("react");
  });

  it("allows RouteConfig without tier/budgets (both optional with documented defaults)", () => {
    const route: RouteConfig = {
      route_id: "catalog",
      path: "/catalog",
      title: "Catalog",
      render_mode: "server",
      data_strategy: "request",
      data_url: "./fixtures/catalog.json",
      islands: [],
    };
    expect(route.tier).toBeUndefined();
    expect(route.budgets).toBeUndefined();
  });

  it("ResolvedRouteConfig requires tier and a fully-populated budgets object", () => {
    const resolved: ResolvedRouteConfig = {
      route_id: "home",
      path: "/",
      title: "Home",
      tier: "critical",
      render_mode: "static",
      data_strategy: "none",
      data_url: null,
      islands: [],
      budgets: {
        lcp_ms: 1800,
        cls: 0.1,
        tbt_ms: 200,
        ttfb_ms: 500,
        js_bytes: 153600,
        html_bytes: 102400,
        hydration_ms: 200,
      },
    };
    expect(resolved.budgets.lcp_ms).toBe(1800);
  });

  it("IslandConfig.props accepts nested JsonValue structures", () => {
    const props: Record<string, JsonValue> = {
      items: [{ label: "Home", href: "/" }, 1, "x", true, null],
    };
    const island: IslandConfig = {
      island_id: "nav",
      contract_id: "nav-menu",
      renderer: "preact",
      hydration: "load",
      props,
    };
    expect(island.props.items).toBeTruthy();
  });

  it("ValidationError.code is restricted to the frozen ErrorCode union", () => {
    const err: ValidationError = { code: "C001", pointer: "/routes/0", message: "x" };
    expect(err.code).toBe("C001");
  });

  it("VetoCode is restricted to the five frozen veto codes (CONTRACTS.md §2)", () => {
    const codes: VetoCode[] = ["V001", "V002", "V003", "V004", "V005"];
    expect(codes).toHaveLength(5);
  });
});
