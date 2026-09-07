# STAGE_INPUTS.md — Downstream Stage Permissions

**Status: FROZEN.** Version 1. Companion to `docs/CONTRACTS.md` and
`docs/REWARD.md`.

Each downstream stage is executed by a model with **no knowledge of the design
conversation**. A stage may read ONLY the files listed for it, plus the
universal set below. A stage produces ONLY its listed outputs (each `.ts` file
with a colocated `.test.ts`). If a stage cannot be implemented from its listed
inputs, that is a contract bug: the stage must stop and report BLOCKED — it
must not invent interfaces.

ADR files (`docs/adr/*`) are rationale, not interface: no stage reads them.

## Universal set (readable by every stage)

- `docs/CONTRACTS.md`
- `package.json`, `tsconfig.json`, `vitest.config.ts` (created in Stage 1)
- its own output files and colocated tests

## Toolchain (fixed for all stages)

- Node ≥ 20, TypeScript 5, Vitest 1 as test runner. ESM throughout
  (`"type": "module"`).
- `tsconfig.json` (created by Stage 1, then frozen): `strict: true`,
  `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "bundler"`,
  `jsx: "react-jsx"`, `skipLibCheck: true`. Preact components override JSX
  source per-file with `/** @jsxImportSource preact */`.
- A stage may add ONLY the dependencies listed in its row, at the listed major
  versions.

---

## Stage 1 — Contract types, validation, resolution, fixtures

| | |
|---|---|
| **Reads** | `docs/CONTRACTS.md` |
| **Produces** | `package.json`, `tsconfig.json`, `vitest.config.ts`; `site.config.json`, `islands/contracts.json`, `fixtures/catalog.json`, `fixtures/dashboard.json`, `kb/records.json` (verbatim from CONTRACTS Appendix A / §13.3); `src/contracts/types.ts`, `src/contracts/constraints.ts`, `src/contracts/validate.ts`, `src/contracts/resolve.ts` + colocated tests |
| **New deps** | dev: `typescript@5`, `vitest@1` |
| **VERIFY** | `npx vitest run src/contracts` |
| **Must implement** | CONTRACTS §1–§5 (S/C codes split per §5.4), §8 resolution, §9.1 profile construction (`makeBaselineProfile`, `applyProposal`), §10 types. Tests MUST include: the 240-tuple checksum (§4.2: 60 illegal / 180 legal), Appendix B vectors B1, B2, B4, B5 (the contract-independent ones), and round-trip validation of the materialized fixtures. |

## Stage 2 — Island contract and registry checks

| | |
|---|---|
| **Reads** | universal set; `src/contracts/types.ts`; `islands/contracts.json`; `site.config.json` |
| **Produces** | `src/islands/contract.ts`, `src/islands/registry.ts` + colocated tests |
| **New deps** | none |
| **VERIFY** | `npx vitest run src/islands` |
| **Must implement** | CONTRACTS §5.4 (`validateWithContracts`, `validateContracts`), §6 (prop typing, reserved `data` prop, contracts-file checks), §7.4 (`validateRegistry`). Tests MUST include Appendix B vectors B3, B6–B9 and an R001/R002 case each. |

## Stage 3 — Renderer adapters, scheduler, reference components

| | |
|---|---|
| **Reads** | universal set; `src/contracts/types.ts`; `src/islands/contract.ts`; `islands/contracts.json` |
| **Produces** | `src/renderers/adapter.ts` (the `RendererAdapter` interface + adapter lookup by `Renderer`), `src/renderers/{react,preact,svelte,vanilla}.ts`, `src/renderers/scheduler.ts`; `src/components/<contract_id>/{react.tsx,preact.tsx,svelte.svelte,vanilla.ts}` for all 3 reference contracts; `islands/registry.json` (12 entries); colocated tests |
| **New deps** | `react@18`, `react-dom@18`, `preact@10`, `svelte@4`; dev: `jsdom@24`, `@sveltejs/vite-plugin-svelte@3` (registered in `vitest.config.ts`) |
| **VERIFY** | `npx vitest run src/renderers src/components` |
| **Must implement** | CONTRACTS §7.1–§7.3, §7.5–§7.6, §6.2 runtime obligations in every implementation. Svelte 4 server render is `Component.render(props).html`. Tests: for each (contract, renderer), `renderToString` output is deterministic and satisfies §6.2 items 1–2 after hydrate in jsdom; scheduler tests cover all five `Hydration` values and `__HARNESS__` state transitions. |

## Stage 4 — Build pipeline

| | |
|---|---|
| **Reads** | universal set; `src/contracts/types.ts`, `src/contracts/resolve.ts`; `src/islands/registry.ts`; `src/renderers/adapter.ts`, `src/renderers/scheduler.ts`; `islands/registry.json`, `islands/contracts.json`, `site.config.json`, `fixtures/*.json` |
| **Produces** | `src/build/build.ts` + colocated test |
| **New deps** | `esbuild@0.21`, `esbuild-svelte@0.8` |
| **VERIFY** | `npx vitest run src/build` |
| **Must implement** | CONTRACTS §9.2 exactly: `server/<route_id>.mjs` for every route, `static/` HTML for static+client routes, per-route `assets/` bundles (scheduler + adapters + island modules, entry generated per route), `data/` copies, `manifest.json`. Shell template and island wrapper markup per §7.5. Tests: build the reference site's baseline profile; assert manifest shape, wrapper attributes present in emitted HTML, and that a `static` route's HTML contains server-rendered island inner HTML while a `client` route's wrappers are empty. |

## Stage 5 — Serve and measure

| | |
|---|---|
| **Reads** | universal set; `src/contracts/types.ts`, `src/contracts/resolve.ts`; `src/build/build.ts`; `site.config.json`, `islands/contracts.json`, `fixtures/*.json` |
| **Produces** | `src/measure/serve.ts`, `src/measure/collect.ts` + colocated tests |
| **New deps** | dev: `playwright@1` (VERIFY prerequisite: `npx playwright install chromium`) |
| **VERIFY** | `npx playwright install chromium && npx vitest run src/measure` |
| **Must implement** | CONTRACTS §11 exactly: serving semantics per §11.3 (static, server-executed `.mjs`, `DATA_PATH_PREFIX`), the sampling procedure and metric capture table of §11.2, `SampleFlags` computation including the run-0 a11y checks of §6.2. Tests: build the reference site, serve it, collect ≥ 1 sample per route; assert every metric is a finite non-negative number, `flags` fields are 0 for the healthy reference site, and the samples validate against the `MeasurementSample` shape. |

## Stage 6 — Reward engine

| | |
|---|---|
| **Reads** | universal set; `docs/REWARD.md`; `src/contracts/types.ts` |
| **Produces** | `src/reward/normalize.ts`, `src/reward/reward.ts`, `src/reward/veto.ts`, `src/reward/decide.ts` + colocated tests |
| **New deps** | none |
| **VERIFY** | `npx vitest run src/reward` |
| **Must implement** | REWARD §2–§7 and its §8 signatures; `ExperimentResult` assembly per CONTRACTS §12 including canonical metric order and §1.5 rounding. Tests MUST reproduce the REWARD Appendix worked example exactly (0.7911) and cover each veto code firing and not firing, plus all four verdicts. |

## Stage 7 — Experiment runner

| | |
|---|---|
| **Reads** | universal set; `docs/REWARD.md`; `src/contracts/types.ts`, `src/contracts/resolve.ts`; `src/build/build.ts`; `src/measure/serve.ts`, `src/measure/collect.ts`; `src/reward/decide.ts`; `site.config.json`, `islands/contracts.json`, `fixtures/*.json` |
| **Produces** | `src/experiment/run.ts` + colocated test |
| **New deps** | none |
| **VERIFY** | `npx playwright install chromium && npx vitest run src/experiment` |
| **Must implement** | CONTRACTS §12 `runExperiment` orchestration and persistence (`runs/…` layout of §15, JSONL ordering of §12), proposal status transitions of §10. Test: run one experiment on the reference site with `n_per_arm: 3` (override) mutating `home/hero` hydration `idle → visible`; assert artifacts exist at the frozen paths, result validates, and `n_per_arm` is echoed. |

## Stage 8 — Knowledge base and proposal generator

| | |
|---|---|
| **Reads** | universal set; `docs/REWARD.md`; `src/contracts/types.ts`, `src/contracts/validate.ts`, `src/contracts/resolve.ts`; `src/islands/contract.ts`; `src/reward/reward.ts`; `site.config.json`, `islands/contracts.json`, `kb/records.json` |
| **Produces** | `src/kb/store.ts`, `src/kb/precedence.ts`, `src/kb/ingest.ts`, `src/propose/generate.ts` + colocated tests |
| **New deps** | none |
| **VERIFY** | `npx vitest run src/kb src/propose` |
| **Must implement** | CONTRACTS §13 (store, `precedes` exactly as written, `query`, ingest + supersede) and §14's six-step algorithm verbatim (step 3's legality filter runs `validate` + `validateWithContracts` on a mutated copy — do not re-derive the rules). Tests MUST include: a precedence table exercising every tiebreak level in order; an ingest/supersede round trip for each verdict; generator determinism (same inputs → identical proposal); the §14 step-3 legality drops (mutation to/from `data_strategy "none"`); and a KB-filter case where a `regresses` record eliminates the otherwise-first candidate. |

---

## Execution order and gate

Stages run strictly 1 → 8. A stage's VERIFY must pass before the next stage
starts. Nothing in any stage may edit `docs/**`, any file another stage owns,
or the fixtures after Stage 1 materializes them (`islands/registry.json`,
owned by Stage 3, is the one addition to the fixture set).
