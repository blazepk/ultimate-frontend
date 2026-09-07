import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve, makeBaselineProfile } from "@harness/contracts";
import type { SiteConfig } from "@harness/contracts";
import { build } from "@harness/build";
import { serve } from "./serve";
import siteConfigJson from "../../../site.config.json";

const referenceConfig = siteConfigJson as unknown as SiteConfig;

let outDir: string;
let handle: Awaited<ReturnType<typeof serve>>;

beforeAll(async () => {
  const resolved = resolve(referenceConfig);
  const profile = makeBaselineProfile(resolved);
  outDir = mkdtempSync(join(tmpdir(), "harness-serve-test-"));
  await build(profile, { out_dir: outDir });
  handle = await serve(outDir, { port: 4610 });
}, 60000);

afterAll(async () => {
  await handle.close();
  rmSync(outDir, { recursive: true, force: true });
});

describe("serve (docs/CONTRACTS.md §11.3)", () => {
  it("serves the static (pre-rendered) home route with server-rendered island HTML", async () => {
    const res = await fetch(`${handle.base_url}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-island="hero"');
    expect(html).toContain("Welcome");
  });

  it("serves the server-rendered catalog route by executing server/catalog.mjs per request", async () => {
    const res = await fetch(`${handle.base_url}/catalog`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-island="table"');
    // catalog's data_strategy is "request" -> server should have injected real row data
    expect(html).toContain("Alpha");
  });

  it("serves the client-mode dashboard route with empty wrappers", async () => {
    const res = await fetch(`${handle.base_url}/dashboard`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<div data-island="table" data-contract="data-table" data-renderer="react" data-hydration="load"></div>');
  });

  it("serves per-route client assets under /assets/", async () => {
    const res = await fetch(`${handle.base_url}/assets/home.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });

  it("serves the dashboard's data file at DATA_PATH_PREFIX + route_id + .json", async () => {
    const res = await fetch(`${handle.base_url}/__data/dashboard.json`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows).toBeDefined();
  });

  it("returns 404 for an unknown path", async () => {
    const res = await fetch(`${handle.base_url}/does-not-exist`);
    expect(res.status).toBe(404);
  });
});
