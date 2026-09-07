# ultimate-frontend

A frontend build system produced by a **stage-gated agent harness** — an
experiment in making agent-written code reviewable instead of merely generated.

The interesting part is not the site it builds. It is the constraint system that
built it: work is divided into numbered stages, each stage may read only a
declared set of files, each stage ends in an executable `VERIFY`, and a stage
that finds a referenced file missing must emit `BLOCKED` and stop rather than
improvise.

## The harness

Authority is explicitly ordered, and lower documents never override higher ones:

| Rank | Document | Role |
|------|----------|------|
| 1 | `docs/CONTRACTS.md` | Frozen. Types, constraints, layout. |
| 2 | `docs/PUBLIC_API.md` | Ratified surface (ADR-0013). |
| 3 | `docs/STAGE_INPUTS.md` | Which files each stage may read. |
| 4 | `prompts/stage-NN.md` | The stage instruction itself. |
| 5 | `files/*.md` | Historical plans. Intent only — never a source of names, paths or signatures. |

Eight stages ran, each with a corresponding decision record in
`docs/decisions/`. Scoping inputs per stage is what keeps a stage from silently
rewriting a neighbouring package; freezing the contracts is what keeps types
stable across stages that never see each other.

## Packages

| Package | What it does |
|---------|--------------|
| `contracts` | Frozen types and constraints every other package compiles against |
| `renderers` | Component renderers (data-table, nav-menu, hero-cta) |
| `islands` | Island hydration boundaries |
| `build` | Build orchestration |
| `measure` | Serving and metric collection |
| `reward` | Scoring engine over collected measurements |
| `experiment` | Experiment runner |
| `kb` | Knowledge ingestion, precedence resolution, proposal generation |

`apps/site` is the Astro consumer that proves the packages compose.

## Status

Verified on the committed tree:

- `pnpm typecheck` — clean
- `pnpm build` — succeeds across all packages
- **241 tests passing** across 24 files (contracts 40, reward 62, kb 58,
  renderers 37, islands 17, experiment 12, measure 8, build 7)

Known issue: `pnpm test` at the repo root exits 1. `apps/site` has a vitest
config but no test files, and vitest treats that as a failure. The package
suites all pass; run `pnpm --filter "./packages/**" test` to see them.

This is a working experiment, not a product. It is published because the
harness is the point.

## Running it

```sh
pnpm install
pnpm typecheck
pnpm --filter "./packages/**" test
pnpm build
```
