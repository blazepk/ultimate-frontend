import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve, makeBaselineProfile } from "@harness/contracts";
import type { SiteConfig } from "@harness/contracts";
import { build } from "./build";
import siteConfigJson from "../../../site.config.json";

const referenceConfig = siteConfigJson as unknown as SiteConfig;

let outDir: string;
let manifest: Awaited<ReturnType<typeof build>>;

beforeAll(async () => {
  const resolved = resolve(referenceConfig);
  const profile = makeBaselineProfile(resolved);
  outDir = mkdtempSync(join(tmpdir(), "harness-build-test-"));
  manifest = await build(profile, { out_dir: outDir });
}, 60000);

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe("build (docs/CONTRACTS.md §9.2)", () => {
  it("produces a manifest with one entry per route, matching BuildManifest shape", () => {
    expect(manifest.schema_version).toBe(1);
    expect(manifest.routes).toHaveLength(3);
    const routeIds = manifest.routes.map((r) => r.route_id).sort();
    expect(routeIds).toEqual(["catalog", "dashboard", "home"]);
    for (const r of manifest.routes) {
      expect(typeof r.server_file).toBe("string");
    }
  });

  it("writes server/<route_id>.mjs for every route", () => {
    const files = readdirSync(join(outDir, "server"));
    expect(files.sort()).toEqual(["catalog.mjs", "dashboard.mjs", "home.mjs"]);
  });

  it("home (static) has a static HTML file containing server-rendered island inner HTML with wrapper attributes", () => {
    const home = manifest.routes.find((r) => r.route_id === "home")!;
    expect(home.render_mode).toBe("static");
    expect(home.html_file).toBe("static/home.html");
    const html = readFileSync(join(outDir, home.html_file!), "utf-8");
    expect(html).toContain('data-island="nav"');
    expect(html).toContain('data-contract="nav-menu"');
    expect(html).toContain('data-renderer="preact"');
    expect(html).toContain('data-hydration="load"');
    expect(html).toContain('data-island="hero"');
    // server-rendered inner HTML actually present (not empty wrappers)
    expect(html).toContain('role="navigation"');
    expect(html).toContain('role="region"');
    expect(html).toContain("Welcome");
  });

  it("dashboard (client) has empty wrappers in its static HTML", () => {
    const dashboard = manifest.routes.find((r) => r.route_id === "dashboard")!;
    expect(dashboard.render_mode).toBe("client");
    expect(dashboard.html_file).toBe("static/dashboard.html");
    const html = readFileSync(join(outDir, dashboard.html_file!), "utf-8");
    expect(html).toContain('<div data-island="nav" data-contract="nav-menu" data-renderer="vanilla" data-hydration="load"></div>');
    expect(html).toContain('<div data-island="table" data-contract="data-table" data-renderer="react" data-hydration="load"></div>');
  });

  it("catalog (server) has no static HTML file, only a server module", () => {
    const catalog = manifest.routes.find((r) => r.route_id === "catalog")!;
    expect(catalog.render_mode).toBe("server");
    expect(catalog.html_file).toBeNull();
  });

  it("emits a per-route client asset for every route with a bootable island or render_mode=client", () => {
    // home has two "load"/"idle" bootable islands -> assets/home.js
    const home = manifest.routes.find((r) => r.route_id === "home")!;
    expect(home.js_files).toHaveLength(1);
    expect(home.js_files[0].file).toBe("assets/home.js");
    expect(home.js_files[0].bytes).toBeGreaterThan(0);
  });

  it("copies the route's data file when data_strategy is client or request", () => {
    const catalog = manifest.routes.find((r) => r.route_id === "catalog")!;
    expect(catalog.data_file).toBe("data/catalog.json");
    const dashboard = manifest.routes.find((r) => r.route_id === "dashboard")!;
    expect(dashboard.data_file).toBe("data/dashboard.json");
    const home = manifest.routes.find((r) => r.route_id === "home")!;
    expect(home.data_file).toBeNull();
  });
});
