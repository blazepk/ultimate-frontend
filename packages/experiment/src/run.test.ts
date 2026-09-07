import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "@harness/contracts";
import type { ExperimentResult, IslandContract, Proposal, SiteConfig } from "@harness/contracts";
import { runExperiment } from "./run";
import siteConfigJson from "../../../site.config.json";
import contractsJson from "../../../islands/contracts.json";

const referenceConfig = siteConfigJson as unknown as SiteConfig;
const referenceContracts = (contractsJson as unknown as { contracts: IslandContract[] }).contracts;

// home/hero is react + idle on a static/none route; moving it to "visible"
// keeps the placement tuple legal (no C-code fires), so the experiment
// exercises orchestration rather than tripping applyProposal's guard.
function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    schema_version: 1,
    proposal_id: "pr_1700000000000_0000",
    created_at: "2026-01-01T00:00:00.000Z",
    target_route_id: "home",
    mutation: { kind: "set_hydration", route_id: "home", island_id: "hero", value: "visible" },
    rationale_kb_ids: [],
    status: "pending",
    ...overrides,
  };
}

let workDir: string;
let result: ExperimentResult;

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "harness-experiment-test-"));
  result = await runExperiment({
    site: resolve(referenceConfig),
    contracts: referenceContracts,
    proposal: makeProposal(),
    n_per_arm: 3,
    work_dir: workDir,
  });
}, 300000);

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("runExperiment — result shape (docs/CONTRACTS.md §12)", () => {
  it("echoes the n_per_arm override rather than defaulting to N_PER_ARM (91)", () => {
    expect(result.n_per_arm).toBe(3);
  });

  it("returns a well-formed ExperimentResult", () => {
    expect(result.schema_version).toBe(1);
    expect(result.experiment_id).toMatch(/^ex_\d{13}_\d{4}$/);
    expect(result.proposal_id).toBe("pr_1700000000000_0000");
    expect(result.target_route_id).toBe("home");
    expect(result.baseline_profile_id).toMatch(/^bp_\d{13}_\d{4}$/);
    expect(result.variant_profile_id).toMatch(/^bp_\d{13}_\d{4}$/);
    expect(result.baseline_profile_id).not.toBe(result.variant_profile_id);
    expect(["accept", "reject", "veto", "inconclusive"]).toContain(result.verdict);
  });

  it("carries all 7 metric comparisons in canonical order, with finite numbers throughout", () => {
    expect(result.metric_comparisons).toHaveLength(7);
    expect(result.metric_comparisons.map((c) => c.metric)).toEqual([
      "lcp_ms",
      "cls",
      "tbt_ms",
      "ttfb_ms",
      "js_bytes",
      "html_bytes",
      "hydration_ms",
    ]);
    for (const comparison of result.metric_comparisons) {
      for (const value of [comparison.baseline_mean, comparison.variant_mean, comparison.score_delta]) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
    for (const value of [result.reward_baseline_mean, result.reward_variant_mean, result.reward_delta, result.z_statistic]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("populates veto_codes if and only if the verdict is \"veto\"", () => {
    if (result.verdict === "veto") {
      expect(result.veto_codes.length).toBeGreaterThan(0);
    } else {
      expect(result.veto_codes).toEqual([]);
    }
  });

  it("orders started_at before completed_at", () => {
    expect(new Date(result.started_at).getTime()).toBeLessThanOrEqual(new Date(result.completed_at).getTime());
  });
});

describe("runExperiment — persistence at the frozen paths (docs/CONTRACTS.md §15)", () => {
  it("writes the ExperimentResult to runs/experiments/<experiment_id>.json", () => {
    const path = join(workDir, "runs", "experiments", `${result.experiment_id}.json`);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual(result);
  });

  it("writes the updated Proposal to runs/proposals/<proposal_id>.json with the mapped terminal status", () => {
    const path = join(workDir, "runs", "proposals", "pr_1700000000000_0000.json");
    expect(existsSync(path)).toBe(true);
    const persisted = JSON.parse(readFileSync(path, "utf-8")) as Proposal;
    const expected = { accept: "accepted", reject: "rejected", veto: "vetoed", inconclusive: "inconclusive" } as const;
    expect(persisted.status).toBe(expected[result.verdict]);
    // the mutation itself must survive the round trip unchanged
    expect(persisted.mutation).toEqual({
      kind: "set_hydration",
      route_id: "home",
      island_id: "hero",
      value: "visible",
    });
  });

  it("writes samples to runs/samples/<experiment_id>.jsonl, baseline first then variant, each in run_index order", () => {
    const path = join(workDir, "runs", "samples", `${result.experiment_id}.jsonl`);
    expect(existsSync(path)).toBe(true);
    const lines = readFileSync(path, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(6); // 3 per arm

    const samples = lines.map((l) => JSON.parse(l));
    expect(samples.map((s) => s.arm)).toEqual(["baseline", "baseline", "baseline", "variant", "variant", "variant"]);
    expect(samples.map((s) => s.run_index)).toEqual([0, 1, 2, 0, 1, 2]);
    // each arm's samples must carry that arm's own profile_id — swapping
    // them is exactly the silent orchestration bug this stage guards against
    expect(samples.slice(0, 3).every((s) => s.profile_id === result.baseline_profile_id)).toBe(true);
    expect(samples.slice(3).every((s) => s.profile_id === result.variant_profile_id)).toBe(true);
    expect(samples.every((s) => s.route_id === "home")).toBe(true);
  });

  it("builds both arms into their own dist/<profile_id>/ directories", () => {
    expect(existsSync(join(workDir, "dist", result.baseline_profile_id, "manifest.json"))).toBe(true);
    expect(existsSync(join(workDir, "dist", result.variant_profile_id, "manifest.json"))).toBe(true);
  });

  it("actually applied the mutation — the variant build differs from the baseline build", () => {
    const baselineHtml = readFileSync(join(workDir, "dist", result.baseline_profile_id, "static", "home.html"), "utf-8");
    const variantHtml = readFileSync(join(workDir, "dist", result.variant_profile_id, "static", "home.html"), "utf-8");
    expect(baselineHtml).toContain('data-island="hero" data-contract="hero-cta" data-renderer="react" data-hydration="idle"');
    expect(variantHtml).toContain('data-island="hero" data-contract="hero-cta" data-renderer="react" data-hydration="visible"');
  });
});

describe("runExperiment — state machine guard (docs/CONTRACTS.md §10)", () => {
  it("refuses to run a proposal that is not \"pending\" — terminal states have no transitions", async () => {
    for (const status of ["testing", "accepted", "rejected", "vetoed", "inconclusive"] as const) {
      await expect(
        runExperiment({
          site: resolve(referenceConfig),
          contracts: referenceContracts,
          proposal: makeProposal({ status }),
          n_per_arm: 1,
          work_dir: workDir,
        }),
      ).rejects.toThrow(/only "pending" proposals can be run/);
    }
  });

  it("throws when the target route does not exist in the site config", async () => {
    await expect(
      runExperiment({
        site: resolve(referenceConfig),
        contracts: referenceContracts,
        proposal: makeProposal({
          target_route_id: "no-such-route",
          mutation: { kind: "set_render_mode", route_id: "no-such-route", value: "server" },
        }),
        n_per_arm: 1,
        work_dir: workDir,
      }),
    ).rejects.toThrow();
  });
});
