// Sample collection procedure, per docs/CONTRACTS.md §11.1, §11.2, §11.3.

import { chromium, type Browser, type Page } from "playwright";
import type {
  ResolvedRouteConfig,
  IslandContract,
  Arm,
  MetricValues,
  SampleFlags,
  MeasurementSample,
} from "@harness/contracts";

const VIEWPORT = { width: 1366, height: 768 }; // CONTRACTS.md §1.4
const CPU_THROTTLE = 4; // CONTRACTS.md §1.4
const SETTLE_MS = 3000; // CONTRACTS.md §1.4
// HYDRATION_TIMEOUT_MS (10000, §1.4) is enforced by the scheduler itself
// (packages/renderers/src/scheduler.ts), which flips status to "error" once
// it elapses. SETTLE_MS (3000) is shorter, so collection reads whatever
// status the scheduler has reached by then — see the hydration_failures
// count below, which follows §11.1's literal wording ("error or not ready
// at collection time"), not a second independent timeout check here.
//
// MetricValues/SampleFlags/MeasurementSample are imported from
// @harness/contracts rather than declared here — an earlier version of this
// file declared them locally (they didn't exist in contracts yet at Stage
// 5); Stage 6 added the frozen versions to packages/contracts/src/types.ts,
// leaving two structurally-identical declarations. Fixed per
// docs/OPEN_QUESTIONS.md #15.

let idSeq = 0;
function generateId(prefix: string): string {
  const unixMs = Date.now().toString().padStart(13, "0");
  const seq = (idSeq++).toString().padStart(4, "0");
  return `${prefix}_${unixMs}_${seq}`;
}

interface HarnessRuntimeState {
  islands: Record<string, { status: string; triggered_at: number | null; ready_at: number | null }>;
  error_count: number;
}

interface RawMetrics {
  ttfb_ms: number;
  lcp_ms: number;
  cls: number;
  tbt_ms: number;
  js_bytes: number;
  html_bytes: number;
}

async function installPerfObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __perf: { lcp: number; cls: number; longtasks: number[] } }).__perf = {
      lcp: 0,
      cls: 0,
      longtasks: [],
    };
    const perf = (window as unknown as { __perf: { lcp: number; cls: number; longtasks: number[] } }).__perf;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) perf.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { hadRecentInput: boolean; value: number }[]) {
        if (!entry.hadRecentInput) perf.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) perf.longtasks.push(entry.duration);
    }).observe({ type: "longtask", buffered: true });
  });
}

async function readRawMetrics(page: Page): Promise<RawMetrics> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const jsBytes = resources.filter((r) => /\.m?js(\?|$)/.test(r.name)).reduce((sum, r) => sum + r.encodedBodySize, 0);
    const perf = (window as unknown as { __perf: { lcp: number; cls: number; longtasks: number[] } }).__perf;
    const tbt = perf.longtasks.reduce((sum, d) => sum + Math.max(0, d - 50), 0);
    return {
      ttfb_ms: nav.responseStart - nav.requestStart,
      lcp_ms: perf.lcp,
      cls: perf.cls,
      tbt_ms: tbt,
      js_bytes: jsBytes,
      html_bytes: nav.encodedBodySize,
    };
  });
}

async function readHarnessState(page: Page): Promise<HarnessRuntimeState> {
  return page.evaluate(
    () => (window as unknown as { __HARNESS__?: HarnessRuntimeState }).__HARNESS__ ?? { islands: {}, error_count: 0 },
  );
}

// CONTRACTS.md §6.2, read per docs/OPEN_QUESTIONS.md #12: role/accessible-name
// live on the data-island wrapper's first element child, not the wrapper
// itself (a component's SSR string cannot reach outside itself to modify the
// wrapper Stage 4's shell template creates).
async function countA11yViolations(page: Page, route: ResolvedRouteConfig, contracts: IslandContract[]): Promise<number> {
  const checks = route.islands.map((island) => {
    const contract = contracts.find((c) => c.contract_id === island.contract_id);
    if (!contract) return null;
    const expectedName =
      contract.a11y.label.source === "static" ? contract.a11y.label.value : String(island.props[contract.a11y.label.prop] ?? "");
    return {
      island_id: island.island_id,
      role: contract.a11y.role,
      expectedName,
      hasKeyboard: contract.a11y.keyboard.length > 0,
      focus: contract.a11y.focus,
    };
  });

  return page.evaluate((checks) => {
    let violations = 0;
    for (const check of checks) {
      if (!check) continue;
      const wrapper = document.querySelector(`[data-island="${check.island_id}"]`);
      const root = wrapper?.firstElementChild;
      if (!root) {
        violations++;
        continue;
      }
      if (check.role !== "none" && root.getAttribute("role") !== check.role) violations++;
      if (check.role !== "none" && root.getAttribute("aria-label") !== check.expectedName) violations++;
      if (check.hasKeyboard) {
        const focusable = root.querySelector(
          'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const rootFocusable = root.matches('[tabindex]:not([tabindex="-1"])') || root.matches("a[href], button, input, select, textarea");
        if (!focusable && !rootFocusable) violations++;
      }
      if (check.focus === "self" && root.getAttribute("tabindex") !== "0") violations++;
    }
    return violations;
  }, checks);
}

async function sampleWithBrowser(
  browser: Browser,
  opts: { base_url: string; profile_id: string; route: ResolvedRouteConfig; contracts: IslandContract[]; arm: Arm; run_index: number },
): Promise<MeasurementSample> {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, bypassCSP: true });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
    await installPerfObservers(page);

    const url = new URL(opts.route.path, opts.base_url).toString();
    await page.goto(url, { waitUntil: "load" });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(SETTLE_MS);

    const raw = await readRawMetrics(page);
    const harnessState = await readHarnessState(page);

    let hydrationMs = 0;
    let hydrationFailures = 0;
    for (const island of Object.values(harnessState.islands)) {
      if (island.status === "ready" && island.triggered_at !== null && island.ready_at !== null) {
        hydrationMs += island.ready_at - island.triggered_at;
      } else {
        hydrationFailures++;
      }
    }

    const a11yViolations = opts.run_index === 0 ? await countA11yViolations(page, opts.route, opts.contracts) : 0;

    return {
      schema_version: 1,
      sample_id: generateId("sm"),
      profile_id: opts.profile_id,
      route_id: opts.route.route_id,
      arm: opts.arm,
      run_index: opts.run_index,
      collected_at: new Date().toISOString(),
      metrics: { ...raw, hydration_ms: hydrationMs },
      flags: {
        hydration_failures: hydrationFailures,
        runtime_errors: harnessState.error_count,
        a11y_violations: a11yViolations,
      },
    };
  } finally {
    await context.close();
  }
}

// CONTRACTS.md §11.3 — function collectSample(opts): Promise<MeasurementSample>
export async function collectSample(opts: {
  base_url: string;
  profile_id: string;
  route: ResolvedRouteConfig;
  contracts: IslandContract[];
  arm: Arm;
  run_index: number;
}): Promise<MeasurementSample> {
  const browser = await chromium.launch();
  try {
    return await sampleWithBrowser(browser, opts);
  } finally {
    await browser.close();
  }
}

// CONTRACTS.md §11.3 — function collectMany(opts): Promise<MeasurementSample[]>
export async function collectMany(opts: {
  base_url: string;
  profile_id: string;
  route: ResolvedRouteConfig;
  contracts: IslandContract[];
  arm: Arm;
  n: number;
}): Promise<MeasurementSample[]> {
  const browser = await chromium.launch();
  try {
    const samples: MeasurementSample[] = [];
    for (let run_index = 0; run_index < opts.n; run_index++) {
      samples.push(
        await sampleWithBrowser(browser, {
          base_url: opts.base_url,
          profile_id: opts.profile_id,
          route: opts.route,
          contracts: opts.contracts,
          arm: opts.arm,
          run_index,
        }),
      );
    }
    return samples;
  } finally {
    await browser.close();
  }
}
