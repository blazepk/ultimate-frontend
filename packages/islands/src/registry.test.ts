import { describe, it, expect } from "vitest";
import { validateRegistry } from "./registry";
import type { SiteConfig, IslandContract } from "@harness/contracts";

const contracts: IslandContract[] = [
  {
    contract_id: "nav-menu",
    props: [{ name: "items", type: "json", required: true, default: null }],
    events: [{ name: "navigate", payload: "json" }],
    a11y: { role: "navigation", label: { source: "static", value: "Main navigation" }, keyboard: ["activate"], focus: "none" },
  },
];

const config: SiteConfig = {
  schema_version: 1,
  site_id: "reg-test",
  routes: [
    {
      route_id: "home",
      path: "/",
      title: "Home",
      render_mode: "static",
      data_strategy: "none",
      data_url: null,
      islands: [{ island_id: "nav", contract_id: "nav-menu", renderer: "preact", hydration: "load", props: {} }],
    },
  ],
};

describe("validateRegistry (docs/CONTRACTS.md §7.4)", () => {
  it("returns [] when every island has a matching, non-duplicated registry entry", () => {
    const registry = {
      schema_version: 1,
      implementations: [{ contract_id: "nav-menu", renderer: "preact", module: "./src/components/nav-menu/preact.tsx" }],
    };
    expect(validateRegistry(registry, config, contracts)).toEqual([]);
  });

  it("R001: two registry entries share (contract_id, renderer)", () => {
    const registry = {
      schema_version: 1,
      implementations: [
        { contract_id: "nav-menu", renderer: "preact", module: "./a.tsx" },
        { contract_id: "nav-menu", renderer: "preact", module: "./b.tsx" },
      ],
    };
    expect(validateRegistry(registry, config, contracts)).toContainEqual({
      code: "R001",
      pointer: "/implementations/1",
      message: expect.any(String),
    });
  });

  it("R002: an island's (contract_id, renderer) has no registry entry", () => {
    const registry = { schema_version: 1, implementations: [] };
    expect(validateRegistry(registry, config, contracts)).toContainEqual({
      code: "R002",
      pointer: "/routes/0/islands/0",
      message: expect.any(String),
    });
  });

  it("S006: registry entry names an unknown contract_id", () => {
    const registry = {
      schema_version: 1,
      implementations: [{ contract_id: "does-not-exist", renderer: "preact", module: "./a.tsx" }],
    };
    expect(validateRegistry(registry, config, contracts)).toContainEqual({
      code: "S006",
      pointer: "/implementations/0/contract_id",
      message: expect.any(String),
    });
  });
});
