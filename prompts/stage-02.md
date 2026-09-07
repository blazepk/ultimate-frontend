---
stage: 2
name: islands-contract-registry-checks
model: Sonnet 5
write_scope: packages/islands/src/**
requires:
  - docs/RULES.md
  - docs/CONTRACTS.md#§4.3
  - docs/CONTRACTS.md#§5.4
  - docs/CONTRACTS.md#§6
  - docs/CONTRACTS.md#§7.4
  - docs/CONTRACTS.md#Appendix-A.1
  - docs/CONTRACTS.md#Appendix-B
  - docs/PUBLIC_API.md
  - packages/islands/package.json
  - packages/islands/tsconfig.json
  - packages/contracts/src/types.ts
  - islands/contracts.json
  - site.config.json
provides:
  - packages/islands/src/contract.ts
  - packages/islands/src/contract.test.ts
  - packages/islands/src/registry.ts
  - packages/islands/src/registry.test.ts
  - packages/islands/src/index.ts
  - packages/islands/tsconfig.json
  - packages/islands/tsconfig.build.json
verify: pnpm --filter @harness/islands typecheck && pnpm --filter @harness/islands test && pnpm --filter @harness/islands build
---

# Stage 2 — Island contract and registry checks · Sonnet 5

Follow `docs/RULES.md`. Read only what is in `requires` above.

## Status

`packages/islands/` currently has only a `package.json` and an empty
`index.ts` stub (from the repo-skeleton stage). `docs/PUBLIC_API.md` names
this package's public entry as `"." → src/index.ts` exporting
`validateWithContracts, validateContracts, validateRegistry`. This is the
first stage to give the package real content — `src/` does not exist yet.
Delete the stale root-level `index.ts` stub once `src/index.ts` exists (do
not leave both).

`packages/islands/tsconfig.json` also still carries the repo-skeleton
pattern (`"include": ["*.ts", "*.tsx"]`, root-level only — it will not match
anything under `src/`). Update it to `"include": ["src/**/*.ts"]` and
`"compilerOptions": { "noEmit": true }` (no `outDir`/`exclude`), matching the
pattern already established in `packages/contracts/tsconfig.json`. Add a new
`packages/islands/tsconfig.build.json` extending it, with
`"compilerOptions": { "noEmit": false, "outDir": "./dist", "declaration":
true }` and `"exclude": ["src/**/*.test.ts"]` — again matching
`packages/contracts/tsconfig.build.json`. Update `package.json`'s `"build"`
script to `"tsc -p tsconfig.build.json"` if it isn't already.

`islands/contracts.json` and `site.config.json` are produced by Stage 1
(`docs/decisions/01-contracts.md` records what it built); this stage reads
them as fixtures, does not modify them.

**Correction found during Stage 2 execution:** `packages/contracts/src/types.ts`
did not yet contain `IslandContract`, `PropSpec`, `EventSpec`, `A11ySpec`,
`ContractsFile`, `PropType`, `AriaRole`, `KeyboardInteraction`, or
`FocusBehavior` — needed by this stage's own function signatures below, but
outside this stage's write scope to add. These were added to
`packages/contracts/src/types.ts` verbatim from CONTRACTS §2/§6.1/§6.5
(mechanical completion of that file's own frozen mandate — CONTRACTS §15:
"contains, verbatim, every type/interface declaration in this document" —
not a design choice) before this stage ran. If re-running this stage fresh,
confirm they're already present; if not, that is a blocking gap, not
something to route around from within `packages/islands`.

## TASK

Implement the island-contract validator and the implementation-registry
validator — the two checks CONTRACTS.md §5.4 assigns outside
`@harness/contracts`, because both need `IslandContract` data that package
never loads.

## OUTPUTS

### `packages/islands/src/contract.ts` + colocated test

```ts
function validateWithContracts(
  config: SiteConfig,
  contracts: IslandContract[],
): ValidationError[];

function validateContracts(contracts: unknown): ValidationError[];
```

`validateWithContracts` checks S006–S010, S013, C005 (CONTRACTS §5.4, §6,
§4.3):
- S006 `UNKNOWN_CONTRACT` — `contract_id` not present in loaded contracts
- S007 `UNKNOWN_PROP` — key in `island.props` not declared by the contract
- S008 `MISSING_REQUIRED_PROP` — contract prop `required: true` (except
  `data`, §6.4) absent from `island.props`
- S009 `PROP_TYPE_MISMATCH` — `island.props` value fails its declared
  `PropType` (§6.3: `"string"` typeof string; `"number"` typeof number and
  finite; `"boolean"` typeof boolean; `"string[]"` array of strings;
  `"number[]"` array of finite numbers; `"json"` any `JsonValue`)
- S010 `RESERVED_DATA_PROP` — `island.props` contains key `"data"`
- S013 `DATA_PROP_REQUIRES_DATA` — contract declares prop `data` with
  `required: true` ∧ route `data_strategy = "none"`
- C005 `EVENTS_REQUIRE_JS` (§4.3) — island's contract declares ≥ 1 event ∧
  `hydration = "none"`

`validateContracts` checks the structural validity of a `ContractsFile`
(§6.5), reusing codes: S016 bad `schema_version`, S001 bad
`contract_id`/prop/event name format (`^[a-z][a-z0-9_]{0,31}$` for
props/events, the authored-ID regex `^[a-z0-9][a-z0-9-]{0,63}$` for
`contract_id`), S005 duplicate `contract_id`/prop name/event name (pointer
disambiguates), S009 a `default` value failing its own declared type or a
non-null default on a required prop, S017 label static-value length
violation (1..80 chars), S008 `label.source = "prop"` naming a prop that
isn't a required string prop.

Tests MUST include Appendix B vectors **B3, B6–B9** (each is Appendix A.2's
reference site with one mutation applied; expected errors are the exact
`(code, pointer)` set):
- B3: `routes[2].islands[0].hydration = "none"` → expect exactly
  `C003 /routes/2/islands/0`, `C004 /routes/2/islands/0`,
  `C005 /routes/2/islands/0`. (C003/C004 come from `@harness/contracts`'
  `checkConstraints` — call it, don't re-derive it; C005 is this package's
  own to detect.)
- B6: `routes[0].islands[1].props = { "heading": "Welcome" }` → expect
  exactly `S008 /routes/0/islands/1`.
- B7: `routes[2].islands[1].props = { "page_size": "many" }` → expect
  exactly `S009 /routes/2/islands/1`.
- B8: `routes[0].islands[0].props.data = 1` (added key) → expect exactly
  `S010 /routes/0/islands/0`.
- B9: `routes[0].islands[1].hydration = "none"` → expect exactly
  `C005 /routes/0/islands/1` (this route is `static`, isolating C005 with no
  C003/C004 interference).

### `packages/islands/src/registry.ts` + colocated test

```ts
function validateRegistry(
  registry: unknown,
  config: SiteConfig,
  contracts: IslandContract[],
): ValidationError[];
```

Checks (CONTRACTS §7.4), reusing codes S016/S001/S006 for the registry
file's own structural validity:
- R001 `DUPLICATE_IMPLEMENTATION` — two entries share (`contract_id`,
  `renderer`)
- R002 `MISSING_IMPLEMENTATION` — some island in the config uses
  (`contract_id`, `renderer`) with no registry entry

Tests MUST include one R001 case and one R002 case, using hand-built
registry fixtures (the real `islands/registry.json` doesn't exist until
Stage 3 runs).

### `packages/islands/src/index.ts`

Barrel matching `docs/PUBLIC_API.md`'s `@harness/islands` `"."` export:
re-export `contract.ts` and `registry.ts`.

## DOCUMENTATION OUTPUT (required)

Also produce `docs/decisions/02-islands.md` using exactly this structure.
Note: `docs/decisions/02-reconciliation.md` already exists from the Stage 2.5
recovery — that is a different document (a different name, same numeric
prefix); do not overwrite it.

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

`pnpm --filter @harness/islands typecheck && pnpm --filter @harness/islands test && pnpm --filter @harness/islands build`
