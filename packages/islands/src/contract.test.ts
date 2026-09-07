import { describe, it, expect } from "vitest";
import { validateWithContracts, validateContracts } from "./contract";
import { checkConstraints } from "@harness/contracts/constraints";
import type { SiteConfig, IslandContract } from "@harness/contracts";
import siteConfigJson from "../../../site.config.json";
import contractsJson from "../../../islands/contracts.json";

const referenceConfig = siteConfigJson as unknown as SiteConfig;
const referenceContracts = (contractsJson as unknown as { contracts: IslandContract[] }).contracts;

// Combines @harness/contracts's checkConstraints (C001-C004, per island) with
// this package's validateWithContracts (S006-S010, S013, C005) — the two
// validators are additive per CONTRACTS.md §5.4; this helper mirrors how a
// caller composes them.
function fullValidate(config: SiteConfig, contracts: IslandContract[]) {
  const errors = [...validateWithContracts(config, contracts)];
  config.routes.forEach((route, routeIndex) => {
    route.islands.forEach((island, islandIndex) => {
      const codes = checkConstraints({
        renderer: island.renderer,
        hydration: island.hydration,
        render_mode: route.render_mode,
        data_strategy: route.data_strategy,
      });
      for (const code of codes) {
        errors.push({ code, pointer: `/routes/${routeIndex}/islands/${islandIndex}`, message: `constraint ${code}` });
      }
    });
  });
  return errors.sort((a, b) => (a.pointer !== b.pointer ? (a.pointer < b.pointer ? -1 : 1) : a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

describe("validateWithContracts (docs/CONTRACTS.md §5.4, §6, §4.3)", () => {
  it("returns [] for the unmodified reference site + contracts (round-trip)", () => {
    expect(validateWithContracts(referenceConfig, referenceContracts)).toEqual([]);
  });

  it("B3: routes[2].islands[0].hydration = \"none\" -> C003, C004, C005 all at /routes/2/islands/0", () => {
    const config: SiteConfig = structuredClone(referenceConfig);
    config.routes[2].islands[0].hydration = "none";
    const errors = fullValidate(config, referenceContracts);
    expect(errors).toEqual([
      { code: "C003", pointer: "/routes/2/islands/0", message: expect.any(String) },
      { code: "C004", pointer: "/routes/2/islands/0", message: expect.any(String) },
      { code: "C005", pointer: "/routes/2/islands/0", message: expect.any(String) },
    ]);
  });

  it("B6: routes[0].islands[1].props = { heading } (missing cta_label) -> exactly S008 /routes/0/islands/1", () => {
    const config: SiteConfig = structuredClone(referenceConfig);
    config.routes[0].islands[1].props = { heading: "Welcome" };
    expect(validateWithContracts(config, referenceContracts)).toEqual([
      { code: "S008", pointer: "/routes/0/islands/1", message: expect.any(String) },
    ]);
  });

  it("B7: routes[2].islands[1].props = { page_size: \"many\" } -> exactly S009 /routes/2/islands/1", () => {
    const config: SiteConfig = structuredClone(referenceConfig);
    config.routes[2].islands[1].props = { page_size: "many" };
    expect(validateWithContracts(config, referenceContracts)).toEqual([
      { code: "S009", pointer: "/routes/2/islands/1", message: expect.any(String) },
    ]);
  });

  it("B8: routes[0].islands[0].props.data = 1 -> exactly S010 /routes/0/islands/0", () => {
    const config: SiteConfig = structuredClone(referenceConfig);
    (config.routes[0].islands[0].props as Record<string, unknown>).data = 1;
    expect(validateWithContracts(config, referenceContracts)).toEqual([
      { code: "S010", pointer: "/routes/0/islands/0", message: expect.any(String) },
    ]);
  });

  it("B9: routes[0].islands[1].hydration = \"none\" -> exactly C005 /routes/0/islands/1 (static route isolates C005)", () => {
    const config: SiteConfig = structuredClone(referenceConfig);
    config.routes[0].islands[1].hydration = "none";
    expect(fullValidate(config, referenceContracts)).toEqual([
      { code: "C005", pointer: "/routes/0/islands/1", message: expect.any(String) },
    ]);
  });

  it("S006: unknown contract_id", () => {
    const config: SiteConfig = structuredClone(referenceConfig);
    config.routes[0].islands[0].contract_id = "does-not-exist";
    expect(validateWithContracts(config, referenceContracts)).toEqual([
      { code: "S006", pointer: "/routes/0/islands/0/contract_id", message: expect.any(String) },
    ]);
  });

  it("S007: unknown prop not declared by the contract", () => {
    const config: SiteConfig = structuredClone(referenceConfig);
    (config.routes[0].islands[1].props as Record<string, unknown>).unknown_prop = "x";
    const errors = validateWithContracts(config, referenceContracts);
    expect(errors).toContainEqual({ code: "S007", pointer: "/routes/0/islands/1", message: expect.any(String) });
  });

  it("S013: contract requires data but route data_strategy is none", () => {
    const contracts: IslandContract[] = structuredClone(referenceContracts);
    // give hero-cta a required "data" prop for this test only
    contracts.find((c) => c.contract_id === "hero-cta")!.props.push({
      name: "data",
      type: "json",
      required: true,
      default: null,
    });
    const errors = validateWithContracts(referenceConfig, contracts);
    // home's render_mode=static, data_strategy=none; hero is on home
    expect(errors).toContainEqual({ code: "S013", pointer: "/routes/0/islands/1", message: expect.any(String) });
  });
});

describe("validateContracts (docs/CONTRACTS.md §6.5)", () => {
  it("returns [] for the unmodified reference contracts file", () => {
    expect(validateContracts(contractsJson)).toEqual([]);
  });

  it("rejects an unsupported schema_version", () => {
    const bad = { schema_version: 2, contracts: [] };
    expect(validateContracts(bad)).toEqual([
      { code: "S016", pointer: "/schema_version", message: expect.any(String) },
    ]);
  });

  it("rejects a duplicate contract_id", () => {
    const bad = structuredClone(contractsJson) as { schema_version: 1; contracts: IslandContract[] };
    bad.contracts.push({ ...bad.contracts[0] });
    expect(validateContracts(bad)).toContainEqual({
      code: "S005",
      pointer: "/contracts/3",
      message: expect.any(String),
    });
  });

  it("rejects a non-null default on a required prop", () => {
    const bad = {
      schema_version: 1,
      contracts: [
        {
          contract_id: "x",
          props: [{ name: "y", type: "string", required: true, default: "nope" }],
          events: [],
          a11y: { role: "none", label: { source: "static", value: "X" }, keyboard: [], focus: "none" },
        },
      ],
    };
    expect(validateContracts(bad)).toContainEqual({
      code: "S009",
      pointer: "/contracts/0/props/0/default",
      message: expect.any(String),
    });
  });
});
