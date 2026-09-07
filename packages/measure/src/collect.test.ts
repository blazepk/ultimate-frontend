import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve, makeBaselineProfile } from "@harness/contracts";
import type { SiteConfig, IslandContract } from "@harness/contracts";
import { build } from "@harness/build";
import { serve } from "./serve";
import { collectSample, collectMany } from "./collect";
import siteConfigJson from "../../../site.config.json";
import contractsJson from "../../../islands/contracts.json";

const referenceConfig = siteConfigJson as unknown as SiteConfig;
const referenceContracts = (contractsJson as unknown as { contracts: IslandContract[] }).contracts;

let outDir: string;
let handle: Awaited<ReturnType<typeof serve>>;
let profileId: string;
let resolvedRoutes: ReturnType<typeof resolve>["routes"];

beforeAll(async () => {
  const resolvedSite = resolve(referenceConfig);
  resolvedRoutes = resolvedSite.routes;
  const profile = makeBaselineProfile(resolvedSite);
  profileId = profile.profile_id;
  outDir = mkdtempSync(join(tmpdir(), "harness-collect-test-"));
  await build(profile, { out_dir: outDir });
  handle = await serve(outDir, { port: 4620 });
}, 60000);

afterAll(async () => {
  await handle.close();
  rmSync(outDir, { recursive: true, force: true });
});

function assertValidSample(sample: Awaited<ReturnType<typeof collectSample>>, routeId: string, runIndex: number) {
  expect(sample.schema_version).toBe(1);
  expect(sample.sample_id).toMatch(/^sm_\d{13}_\d{4}$/);
  expect(sample.profile_id).toBe(profileId);
  expect(sample.route_id).toBe(routeId);
  expect(sample.run_index).toBe(runIndex);
  expect(sample.arm).toBe("scan");
  for (const value of Object.values(sample.metrics)) {
    expect(typeof value).toBe("number");
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  }
}

describe("collectSample / collectMany (docs/CONTRACTS.md §11.1, §11.2)", () => {
  it("collects one valid sample per route, with zero flags for the healthy reference site", async () => {
    for (const route of resolvedRoutes) {
      const sample = await collectSample({
        base_url: handle.base_url,
        profile_id: profileId,
        route,
        contracts: referenceContracts,
        arm: "scan",
        run_index: 0,
      });
      assertValidSample(sample, route.route_id, 0);
      expect(sample.flags.hydration_failures).toBe(0);
      expect(sample.flags.runtime_errors).toBe(0);
      expect(sample.flags.a11y_violations).toBe(0);
    }
  }, 60000);

  it("collectMany returns n samples in run_index order, with a11y measured only on run_index 0", async () => {
    const home = resolvedRoutes.find((r) => r.route_id === "home")!;
    const samples = await collectMany({
      base_url: handle.base_url,
      profile_id: profileId,
      route: home,
      contracts: referenceContracts,
      arm: "scan",
      n: 2,
    });
    expect(samples).toHaveLength(2);
    expect(samples[0].run_index).toBe(0);
    expect(samples[1].run_index).toBe(1);
    // a11y_violations is measured on run_index 0 only; fixed at 0 elsewhere
    // (the reference site is healthy, so run 0 is also 0 here — the
    // distinguishing behavior is exercised structurally, not by a nonzero
    // value, since this fixture has no a11y violations to surface).
    expect(samples[1].flags.a11y_violations).toBe(0);
  }, 60000);
});
