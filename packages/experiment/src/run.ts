// Experiment orchestration, per docs/CONTRACTS.md §12 (runExperiment),
// §10 (proposal status machine), and §15 (runs/ persistence layout).
//
// Sequence: makeBaselineProfile + applyProposal -> build both profiles ->
// serve both -> collectMany per arm on the TARGET ROUTE ONLY -> decide ->
// persist result, samples, and the updated proposal.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeBaselineProfile, applyProposal } from "@harness/contracts";
import type {
  ExperimentResult,
  IslandContract,
  MeasurementSample,
  Proposal,
  ProposalStatus,
  ResolvedRouteConfig,
  ResolvedSiteConfig,
  Verdict,
} from "@harness/contracts";
import { build } from "@harness/build";
import { serve, collectMany } from "@harness/measure";
import { decide } from "@harness/engine";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");

const N_PER_ARM = 91; // CONTRACTS §1.4
const SERVE_PORT_BASE = 4600; // CONTRACTS §1.4 — "First port tried"

// CONTRACTS §1.1 — <prefix>_<unix_ms>_<seq>, 13-digit epoch ms, 4-digit
// zero-padded per-process counter starting "0000".
let idSeq = 0;
function generateId(prefix: string): string {
  const unixMs = Date.now().toString().padStart(13, "0");
  const seq = (idSeq++).toString().padStart(4, "0");
  return `${prefix}_${unixMs}_${seq}`;
}

// REWARD.md §7 — verdict -> ProposalStatus, 1:1.
const VERDICT_TO_STATUS: Record<Verdict, ProposalStatus> = {
  accept: "accepted",
  reject: "rejected",
  veto: "vetoed",
  inconclusive: "inconclusive",
};

// SERVE_PORT_BASE is documented as the FIRST port tried, so a busy port is
// expected rather than fatal — walk upward until one binds. Without this,
// two experiments (or a leftover server from a previous run) collide on
// EADDRINUSE and the whole experiment fails for an incidental reason.
async function serveOnAvailablePort(
  distDir: string,
  firstPort: number,
): Promise<{ base_url: string; close(): Promise<void>; port: number }> {
  const MAX_ATTEMPTS = 50;
  let lastError: unknown;
  for (let port = firstPort; port < firstPort + MAX_ATTEMPTS; port++) {
    try {
      const handle = await serve(distDir, { port });
      return { ...handle, port };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`runExperiment: no free port in [${firstPort}, ${firstPort + MAX_ATTEMPTS}): ${String(lastError)}`);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

// CONTRACTS §12: one MeasurementSample per line, baseline runs first, then
// variant, each in run_index order.
function writeSamplesJsonl(path: string, baseline: MeasurementSample[], variant: MeasurementSample[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const ordered = [
    ...[...baseline].sort((a, b) => a.run_index - b.run_index),
    ...[...variant].sort((a, b) => a.run_index - b.run_index),
  ];
  writeFileSync(path, ordered.map((s) => JSON.stringify(s)).join("\n") + (ordered.length > 0 ? "\n" : ""));
}

function findTargetRoute(site: ResolvedSiteConfig, routeId: string): ResolvedRouteConfig {
  const route = site.routes.find((r) => r.route_id === routeId);
  if (!route) {
    throw new Error(`runExperiment: target route "${routeId}" not found in site config`);
  }
  return route;
}

// CONTRACTS §12 — function runExperiment(opts): Promise<ExperimentResult>
export async function runExperiment(opts: {
  site: ResolvedSiteConfig;
  contracts: IslandContract[];
  proposal: Proposal;
  n_per_arm?: number;
  work_dir?: string;
}): Promise<ExperimentResult> {
  const n_per_arm = opts.n_per_arm ?? N_PER_ARM;
  const work_dir = opts.work_dir ?? REPO_ROOT;
  const started_at = new Date().toISOString();

  // CONTRACTS §10: "pending → testing → (accepted | rejected | vetoed |
  // inconclusive)"; terminal states have no transitions. Re-running an
  // already-decided proposal would silently overwrite its recorded outcome,
  // so refuse rather than transition out of a terminal state.
  if (opts.proposal.status !== "pending") {
    throw new Error(
      `runExperiment: proposal ${opts.proposal.proposal_id} has status "${opts.proposal.status}"; only "pending" proposals can be run`,
    );
  }

  const experiment_id = generateId("ex");
  const targetRoute = findTargetRoute(opts.site, opts.proposal.target_route_id);

  // Build both arms. applyProposal re-checks the combination constraints and
  // throws (message prefixed with the violated C-code) if the mutation
  // produces an illegal placement, so an invalid proposal fails here rather
  // than producing measurable-but-meaningless output.
  const baselineProfile = makeBaselineProfile(opts.site);
  const variantProfile = applyProposal(opts.site, opts.proposal);

  const baselineDist = join(work_dir, "dist", baselineProfile.profile_id);
  const variantDist = join(work_dir, "dist", variantProfile.profile_id);
  await build(baselineProfile, { out_dir: baselineDist });
  await build(variantProfile, { out_dir: variantDist });

  // The variant's resolved route (post-mutation) is what the variant arm is
  // measured against — using the baseline route for both arms would collect
  // the variant's samples under the baseline's budgets and a11y expectations.
  const variantRoute = findTargetRoute(
    { schema_version: 1, site_id: opts.site.site_id, routes: variantProfile.routes },
    opts.proposal.target_route_id,
  );

  // Mark in-flight before measurement starts, so a crash mid-run leaves
  // "testing" on disk rather than a stale "pending".
  const proposalPath = join(work_dir, "runs", "proposals", `${opts.proposal.proposal_id}.json`);
  const testingProposal: Proposal = { ...opts.proposal, status: "testing" };
  writeJson(proposalPath, testingProposal);

  const baselineServer = await serveOnAvailablePort(baselineDist, SERVE_PORT_BASE);
  const variantServer = await serveOnAvailablePort(variantDist, baselineServer.port + 1);

  let baselineSamples: MeasurementSample[];
  let variantSamples: MeasurementSample[];
  try {
    baselineSamples = await collectMany({
      base_url: baselineServer.base_url,
      profile_id: baselineProfile.profile_id,
      route: targetRoute,
      contracts: opts.contracts,
      arm: "baseline",
      n: n_per_arm,
    });
    variantSamples = await collectMany({
      base_url: variantServer.base_url,
      profile_id: variantProfile.profile_id,
      route: variantRoute,
      contracts: opts.contracts,
      arm: "variant",
      n: n_per_arm,
    });
  } finally {
    await baselineServer.close();
    await variantServer.close();
  }

  const result = decide({
    experiment_id,
    proposal_id: opts.proposal.proposal_id,
    target_route_id: opts.proposal.target_route_id,
    baseline_profile_id: baselineProfile.profile_id,
    variant_profile_id: variantProfile.profile_id,
    started_at,
    completed_at: new Date().toISOString(),
    baseline: baselineSamples,
    variant: variantSamples,
    // Budgets come from the VARIANT's resolved route: a proposal that
    // changes tier or budgets must be judged against what it proposes, not
    // against what it replaced.
    budgets: variantRoute.budgets,
  });

  writeJson(join(work_dir, "runs", "experiments", `${experiment_id}.json`), result);
  writeSamplesJsonl(join(work_dir, "runs", "samples", `${experiment_id}.jsonl`), baselineSamples, variantSamples);
  writeJson(proposalPath, { ...opts.proposal, status: VERDICT_TO_STATUS[result.verdict] } satisfies Proposal);

  return result;
}
