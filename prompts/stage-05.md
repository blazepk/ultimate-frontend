---
stage: 5
name: serve-and-measure
model: Sonnet 5
write_scope: packages/measure/src/**
requires:
  - docs/RULES.md
  - docs/CONTRACTS.md#§1.4
  - docs/CONTRACTS.md#§6.2
  - docs/CONTRACTS.md#§11.1
  - docs/CONTRACTS.md#§11.2
  - docs/CONTRACTS.md#§11.3
  - docs/PUBLIC_API.md
  - packages/measure/package.json
  - packages/measure/tsconfig.json
  - packages/contracts/src/types.ts
  - packages/contracts/src/resolve.ts
  - packages/build/src/build.ts
  - site.config.json
  - islands/contracts.json
  - fixtures/catalog.json
  - fixtures/dashboard.json
provides:
  - packages/measure/src/serve.ts
  - packages/measure/src/serve.test.ts
  - packages/measure/src/collect.ts
  - packages/measure/src/collect.test.ts
  - packages/measure/src/index.ts
  - packages/measure/tsconfig.json
  - packages/measure/tsconfig.build.json
verify: npx playwright install chromium && pnpm --filter @harness/measure typecheck && pnpm --filter @harness/measure test && pnpm --filter @harness/measure build
---

# Stage 5 — Serve and measure · Sonnet 5

Follow `docs/RULES.md`. Read only what is in `requires` above.

## Status

`packages/measure/` currently has only a `package.json` and an empty
`index.ts` stub. This stage gives it real content under `src/`; delete the
stale root `index.ts` once `src/index.ts` exists. Add `playwright@1` as a
dev dependency (the only new dependency this stage is permitted).

`packages/measure/tsconfig.json` also still carries the repo-skeleton
pattern (`"include": ["*.ts", "*.tsx"]`, root-level only — it will not match
anything under `src/`). Update it to `"include": ["src/**/*.ts"]` and
`"compilerOptions": { "noEmit": true }` (no `outDir`/`exclude`), matching
`packages/contracts/tsconfig.json`. Add a new
`packages/measure/tsconfig.build.json` extending it, with
`"compilerOptions": { "noEmit": false, "outDir": "./dist", "declaration":
true }` and `"exclude": ["src/**/*.test.ts"]`. Update `package.json`'s
`"build"` script to `"tsc -p tsconfig.build.json"` if it isn't already.

All measurement in this system is headless Chromium via Playwright — no
Lighthouse, no RUM beacon. An earlier, now-corrected draft of
`docs/PUBLIC_API.md` proposed both; `docs/adr/0006-lab-only-measurement.md`
rejected both explicitly. Do not implement either.

## TASK

Implement the local static/server file server and the sample-collection
procedure CONTRACTS §11 specifies.

## OUTPUTS

### `packages/measure/src/serve.ts` + colocated test

```ts
function serve(dist_dir: string, opts: { port: number }): Promise<{
  base_url: string;
  close(): Promise<void>;
}>;
```

Serves `static/` files at their route paths, executes `server/<route_id>.mjs`
per request for `"server"` routes (reading and parsing the route's data file
per request when `data_strategy = "request"`, passing `null` otherwise),
serves `assets/`, and serves the data file at `DATA_PATH_PREFIX +
"<route_id>.json"` (`DATA_PATH_PREFIX = "/__data/"`, CONTRACTS §1.4) for
`data_strategy = "client"` routes. Driven entirely by `manifest.json`; no
`SiteConfig` access needed.

### `packages/measure/src/collect.ts` + colocated test

```ts
function collectSample(opts: {
  base_url: string; profile_id: string; route: ResolvedRouteConfig;
  contracts: IslandContract[]; arm: Arm; run_index: number;
}): Promise<MeasurementSample>;

function collectMany(opts: {
  base_url: string; profile_id: string; route: ResolvedRouteConfig;
  contracts: IslandContract[]; arm: Arm; n: number;
}): Promise<MeasurementSample[]>;   // run_index 0..n-1, sequential
```

`MeasurementSample` and its parts (§11.1):

```ts
interface MetricValues {
  lcp_ms: number; cls: number; tbt_ms: number; ttfb_ms: number;
  js_bytes: number; html_bytes: number; hydration_ms: number;  // all ≥ 0
}

interface SampleFlags {
  hydration_failures: number;  // islands "error" or not "ready" at collection
  runtime_errors: number;      // __HARNESS__.error_count at collection
  a11y_violations: number;     // §6.2 check failures; MEASURED ONLY on
                               // run_index 0, fixed at 0 on other runs
}

interface MeasurementSample {
  schema_version: 1;
  sample_id: string;           // sm_… (§1.1: <prefix>_<unix_ms>_<seq>)
  profile_id: string;
  route_id: string;
  arm: Arm;                    // "baseline" | "variant" | "scan"
  run_index: number;
  collected_at: string;        // §1.2 ISO-8601 UTC ms
  metrics: MetricValues;
  flags: SampleFlags;
}
```

Procedure (§11.2, normative): headless Chromium via Playwright; viewport
1366×768, DPR 1; CPU throttle 4× (`CPU_THROTTLE`, §1.4); network
unthrottled (localhost); a fresh browser context per sample, cache disabled.
Per sample: navigate → wait for `load` → wait for network idle (no requests
in flight for 500ms) → wait `SETTLE_MS` (3000, §1.4) → collect.

Metric capture:

| Metric | Definition |
|---|---|
| `ttfb_ms` | navigation entry `responseStart − requestStart` |
| `lcp_ms` | `startTime` of the last `largest-contentful-paint` entry |
| `cls` | sum of `layout-shift` entry values with `hadRecentInput = false` |
| `tbt_ms` | Σ `max(0, duration − 50)` over all `longtask` entries |
| `js_bytes` | Σ `encodedBodySize` of resource entries ending `.js`/`.mjs` |
| `html_bytes` | navigation entry `encodedBodySize` |
| `hydration_ms` | Σ (`ready_at − triggered_at`) over `__HARNESS__` islands with status `ready` |

Performance observers installed before navigation (init script),
`buffered: true`. `flags.hydration_failures` counts islands in status
`"error"` or not `"ready"` at collection time; a hydration failure is any
island whose boot didn't reach `ready` within `HYDRATION_TIMEOUT_MS`
(10000, §1.4). `contracts` is required for the run-0 a11y checks (§6.2 →
`SampleFlags.a11y_violations`): role, accessible name, focusable-when-
keyboard-declared, `tabindex`/tab-cycling per `focus`.

Test: build the reference site, serve it, collect ≥1 sample per route via
`collectSample`/`collectMany`. Assert every metric is a finite non-negative
number, `flags` fields are 0 for the healthy reference site, samples
validate against the `MeasurementSample` shape.

### `packages/measure/src/index.ts`

Barrel matching `docs/PUBLIC_API.md`'s `@harness/measure` `"."` export
(`serve`, `collectSample`, `collectMany`).

## DOCUMENTATION OUTPUT (required)

Also produce `docs/decisions/05-measure.md` using exactly this structure:

```
## What this stage built
Two to four sentences. What exists now that did not before, in terms a reader who has
not seen the code can follow.

## Decisions made during implementation
For each non-obvious choice, in this format:
  **Decision:** what was chosen
  **Alternatives rejected:** what else was viable, and specifically why not
  **Revisit when:** the concrete condition that would make this the wrong choice
Only include decisions where a competent engineer could reasonably have chosen otherwise.
Skip anything CONTRACTS.md already dictated — that is Stage 0's record, not yours.

## Load-bearing assumptions
What this code assumes to be true that is not enforced by the type system. For each,
state what breaks if it stops holding. Be specific: name the function and the failure.

## How to tell if this is still correct
The command to run, and what its output should look like. A future reader must be able
to check this stage's health without reading the implementation.

## Escalated
Anything appended to docs/OPEN_QUESTIONS.md, and the conservative reading chosen instead.
```

Write for someone reading in six months with no memory of this work.

## VERIFY

`npx playwright install chromium && pnpm --filter @harness/measure typecheck && pnpm --filter @harness/measure test && pnpm --filter @harness/measure build`
