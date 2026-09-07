import { describe, it, expect } from "vitest";
import { validate } from "./validate";
import type { SiteConfig, Renderer, Hydration, RenderMode, DataStrategy } from "./types";
import siteConfigJson from "../../../site.config.json";

const referenceConfig = siteConfigJson as unknown as SiteConfig;

describe("validate (docs/CONTRACTS.md §5.4, §5.2, §4.1)", () => {
  it("returns [] for the unmodified reference site.config.json (round-trip)", () => {
    expect(validate(referenceConfig)).toEqual([]);
  });

  it("240-tuple checksum: exactly 60 of 240 placement tuples are illegal, reported via C-codes", () => {
    const renderers: Renderer[] = ["react", "preact", "svelte", "vanilla"];
    const hydrations: Hydration[] = ["none", "load", "idle", "visible", "interaction"];
    const renderModes: RenderMode[] = ["static", "server", "client"];
    const dataStrategies: DataStrategy[] = ["none", "static", "request", "client"];

    let illegal = 0;
    let legal = 0;
    for (const renderer of renderers) {
      for (const hydration of hydrations) {
        for (const render_mode of renderModes) {
          for (const data_strategy of dataStrategies) {
            const config: SiteConfig = {
              schema_version: 1,
              site_id: "checksum",
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
            const errors = validate(config);
            const hasCCode = errors.some((e) => e.code.startsWith("C"));
            if (hasCCode) illegal++;
            else legal++;
          }
        }
      }
    }
    expect(illegal).toBe(60);
    expect(legal).toBe(180);
  });

  it("B1: routes[0].data_strategy = \"request\" -> exactly C001 /routes/0, S011 /routes/0", () => {
    const config: SiteConfig = structuredClone(referenceConfig);
    config.routes[0].data_strategy = "request";
    expect(validate(config)).toEqual([
      { code: "C001", pointer: "/routes/0", message: expect.any(String) },
      { code: "S011", pointer: "/routes/0", message: expect.any(String) },
    ]);
  });

  it("B2: routes[2].data_strategy = \"request\" -> exactly C002 /routes/2", () => {
    const config: SiteConfig = structuredClone(referenceConfig);
    config.routes[2].data_strategy = "request";
    expect(validate(config)).toEqual([{ code: "C002", pointer: "/routes/2", message: expect.any(String) }]);
  });

  it("B4: routes[1].route_id = \"home\" -> exactly S002 /routes/1", () => {
    const config: SiteConfig = structuredClone(referenceConfig);
    config.routes[1].route_id = "home";
    expect(validate(config)).toEqual([{ code: "S002", pointer: "/routes/1", message: expect.any(String) }]);
  });

  it("B5: routes[1].data_url = null -> exactly S011 /routes/1", () => {
    const config: SiteConfig = structuredClone(referenceConfig);
    config.routes[1].data_url = null;
    expect(validate(config)).toEqual([{ code: "S011", pointer: "/routes/1", message: expect.any(String) }]);
  });

  it("collects all errors (no fail-fast) and sorts by (pointer, code) ascending", () => {
    const config: SiteConfig = structuredClone(referenceConfig);
    config.routes[1].route_id = "home"; // S002 /routes/1
    config.routes[1].data_url = null; // S011 /routes/1 (also breaks C002-adjacent S011 alone since data_strategy stays request)
    const errors = validate(config);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const pointers = errors.map((e) => e.pointer);
    const sorted = [...pointers].sort();
    expect(pointers).toEqual(sorted);
  });

  it("rejects a non-object config as S016 at /schema_version", () => {
    expect(validate(null)).toEqual([{ code: "S016", pointer: "/schema_version", message: expect.any(String) }]);
    expect(validate("nope")).toEqual([{ code: "S016", pointer: "/schema_version", message: expect.any(String) }]);
  });

  it("rejects a non-array routes as S015 at /routes", () => {
    expect(validate({ schema_version: 1, site_id: "x", routes: "nope" })).toEqual([
      { code: "S015", pointer: "/routes", message: expect.any(String) },
    ]);
  });

  it("rejects empty routes as S015 at /routes", () => {
    expect(validate({ schema_version: 1, site_id: "x", routes: [] })).toEqual([
      { code: "S015", pointer: "/routes", message: expect.any(String) },
    ]);
  });

  it("flags a budget value <= 0 as S014 at the specific field", () => {
    const config: SiteConfig = structuredClone(referenceConfig);
    config.routes[0].budgets = { lcp_ms: 0 };
    expect(validate(config)).toEqual([
      { code: "S014", pointer: "/routes/0/budgets/lcp_ms", message: expect.any(String) },
    ]);
  });

  it("flags an invalid path as S004 and an invalid title length as S017", () => {
    const config: SiteConfig = structuredClone(referenceConfig);
    config.routes[0].path = "no-leading-slash";
    config.routes[0].title = "";
    const errors = validate(config);
    expect(errors).toContainEqual({ code: "S004", pointer: "/routes/0/path", message: expect.any(String) });
    expect(errors).toContainEqual({ code: "S017", pointer: "/routes/0/title", message: expect.any(String) });
  });
});
