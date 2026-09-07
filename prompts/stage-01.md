---
stage: 1
name: contracts-validate-profiles-fixtures
model: Sonnet 5
write_scope: packages/contracts/src/**, site.config.json, islands/contracts.json, fixtures/catalog.json, fixtures/dashboard.json, kb/records.json
requires:
  - docs/RULES.md
  - docs/CONTRACTS.md#§1
  - docs/CONTRACTS.md#§3
  - docs/CONTRACTS.md#§4
  - docs/CONTRACTS.md#§5
  - docs/CONTRACTS.md#§8
  - docs/CONTRACTS.md#§9.1
  - docs/CONTRACTS.md#§10
  - docs/CONTRACTS.md#Appendix-A
  - docs/CONTRACTS.md#Appendix-B
  - docs/PUBLIC_API.md
  - package.json
  - tsconfig.json
  - vitest.config.ts
  - packages/contracts/package.json
  - packages/contracts/tsconfig.json
  - packages/contracts/tsconfig.build.json
  - packages/contracts/src/types.ts
  - packages/contracts/src/constraints.ts
  - packages/contracts/src/resolve.ts
  - packages/contracts/src/budget.ts
provides:
  - site.config.json
  - islands/contracts.json
  - fixtures/catalog.json
  - fixtures/dashboard.json
  - kb/records.json
  - packages/contracts/src/types.ts (extended — see below)
  - packages/contracts/src/validate.ts
  - packages/contracts/src/validate.test.ts
  - packages/contracts/src/resolve.ts (extended — see below)
  - packages/contracts/src/resolve.test.ts (extended — see below)
verify: pnpm --filter @harness/contracts typecheck && pnpm --filter @harness/contracts test && pnpm --filter @harness/contracts build
---

# Stage 1 — Contracts: validation, build profiles, fixtures · Sonnet 5

Follow `docs/RULES.md`. Read only what is in `requires` above.

## Status: this package is partially built already

`packages/contracts/src/{types,constraints,resolve,budget}.ts` already exist
and already pass `pnpm --filter @harness/contracts test` (22 tests). Do not
recreate them and do not rename, reformat, or restructure anything already in
them beyond the specific additions below. Read them first — they establish
the file's existing conventions (naming, import style, comment style) and you
should match those conventions in what you add.

`types.ts` currently exports: `JsonValue`, `Renderer`, `Hydration`,
`RenderMode`, `DataStrategy`, `Tier`, `VetoCode`, `SiteConfig`, `RouteConfig`,
`IslandConfig`, `RouteBudgets`, `ResolvedRouteConfig`, `ResolvedSiteConfig`,
`ValidationError`, `ErrorCode`. `resolve.ts` currently exports `resolve()`
only. `constraints.ts` exports `PlacementTuple`, `checkStaticShellRequestData`,
`checkClientShellRequestData`, `checkClientShellDeadIsland`,
`checkUnhydratedClientData`, `checkConstraints`. `budget.ts` exports
`BudgetMetricKey`, `MetricMeans`, `BudgetCheckResult`, `checkBudget`.

## TASK

Complete the remaining CONTRACTS.md §5.4 obligations for `@harness/contracts`
that the migration in `docs/decisions/02-reconciliation.md` explicitly left
open: `validate()`, `makeBaselineProfile()`, `applyProposal()`, and the
reference fixture files.

## OUTPUTS

### `packages/contracts/src/types.ts` — extend with these frozen types

Add, verbatim (CONTRACTS.md §9.1, §10):

```ts
interface BuildProfile {
  schema_version: 1;
  profile_id: string;                       // bp_… (§1.1)
  site_id: string;
  created_at: string;                       // §1.2
  source:
    | { kind: "baseline" }
    | { kind: "proposal"; proposal_id: string };
  routes: ResolvedRouteConfig[];            // ALL routes, fully resolved
}

type Mutation =
  | { kind: "set_hydration";     route_id: string; island_id: string; value: Hydration }
  | { kind: "set_renderer";      route_id: string; island_id: string; value: Renderer }
  | { kind: "set_render_mode";   route_id: string; value: RenderMode }
  | { kind: "set_data_strategy"; route_id: string; value: DataStrategy };

type ProposalStatus =
  | "pending" | "testing"
  | "accepted" | "rejected" | "vetoed" | "inconclusive";

interface Proposal {
  schema_version: 1;
  proposal_id: string;            // pr_…
  created_at: string;
  target_route_id: string;        // equals mutation.route_id
  mutation: Mutation;             // exactly ONE mutation per proposal
  rationale_kb_ids: string[];     // may be []
  status: ProposalStatus;
}
```

`bp_`/`pr_` ID format: CONTRACTS §1.1 — `<prefix>_<unix_ms>_<seq>`, 13-digit
epoch-ms, 4-digit zero-padded per-process counter starting `0000`.

### `packages/contracts/src/validate.ts` (new) + colocated test

CONTRACTS §5.4: `function validate(config: unknown): ValidationError[]`.
Checks S001–S005, S011, S012, S014–S018 (structural, §5.2) and C001–C004
(combination, §4.1 — reuse `checkConstraints` from `constraints.ts`, do not
re-derive the predicates). `[]` means valid. Collect all errors (no
fail-fast); sort by `(pointer, code)` ascending, both lexicographic (§5.3).

Tests MUST include:
- The 240-tuple checksum (§4.2): enumerate all 240 `(renderer, hydration,
  render_mode, data_strategy)` combinations and assert exactly 60 illegal /
  180 legal.
- Appendix B vectors **B1, B2, B4, B5** (the contract-independent ones — B3
  and B6–B9 need `IslandContract` data and are Stage 2's, not yours):
  - B1: `routes[0].data_strategy = "request"` on the reference site (Appendix
    A.2) → expect exactly `C001 /routes/0`, `S011 /routes/0`.
  - B2: `routes[2].data_strategy = "request"` → expect exactly `C002 /routes/2`.
  - B4: `routes[1].route_id = "home"` → expect exactly `S002 /routes/1`.
  - B5: `routes[1].data_url = null` → expect exactly `S011 /routes/1`.
- Round-trip: `validate()` returns `[]` for the unmodified reference
  `site.config.json` (Appendix A.2, materialized below).

### `packages/contracts/src/resolve.ts` — extend with these functions

CONTRACTS §5.4 and §9.1:

```ts
function makeBaselineProfile(site: ResolvedSiteConfig): BuildProfile;
function applyProposal(site: ResolvedSiteConfig, p: Proposal): BuildProfile;
```

`makeBaselineProfile` copies the resolved site unchanged into a
`{ kind: "baseline" }`-sourced profile. `applyProposal` copies the site,
applies the proposal's single mutation to the target route/island, and
re-runs `checkConstraints` on the mutated route — **THROW** an `Error` whose
message begins with the violated code if any C-code matches. Data-strategy
normalization (§9.1): a `set_data_strategy` mutation with value `"none"` also
sets the route's `data_url` to `null`; a `set_data_strategy` mutation on a
route whose current strategy is already `"none"` THROWS (no data file exists
to serve the new strategy).

### Fixture files — materialize verbatim from CONTRACTS.md

- `site.config.json` — CONTRACTS.md Appendix A.2, verbatim.
- `islands/contracts.json` — CONTRACTS.md Appendix A.1, verbatim.
- `fixtures/catalog.json`, `fixtures/dashboard.json` — CONTRACTS.md
  Appendix A.3, verbatim.
- `kb/records.json` — CONTRACTS.md §13.3's initial state, verbatim:
  `{ "schema_version": 1, "records": [] }`.

## DOCUMENTATION OUTPUT (required)

Also produce `docs/decisions/01-contracts.md` using exactly this structure:

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

`pnpm --filter @harness/contracts typecheck && pnpm --filter @harness/contracts test && pnpm --filter @harness/contracts build`
