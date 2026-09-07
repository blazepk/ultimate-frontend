---
stage: 8
name: kb-and-proposal-generator
model: Sonnet 5
write_scope: packages/kb/src/**
requires:
  - docs/RULES.md
  - docs/REWARD.md
  - docs/CONTRACTS.md#§1.1
  - docs/CONTRACTS.md#§13
  - docs/CONTRACTS.md#§14
  - docs/PUBLIC_API.md
  - packages/kb/package.json
  - packages/kb/tsconfig.json
  - packages/contracts/src/types.ts
  - packages/contracts/src/validate.ts
  - packages/contracts/src/resolve.ts
  - packages/islands/src/contract.ts
  - packages/reward/src/reward.ts
  - site.config.json
  - islands/contracts.json
  - kb/records.json
provides:
  - packages/kb/src/store.ts
  - packages/kb/src/store.test.ts
  - packages/kb/src/precedence.ts
  - packages/kb/src/precedence.test.ts
  - packages/kb/src/ingest.ts
  - packages/kb/src/ingest.test.ts
  - packages/kb/src/propose/generate.ts
  - packages/kb/src/propose/generate.test.ts
  - packages/kb/src/index.ts
  - packages/kb/tsconfig.json
  - packages/kb/tsconfig.build.json
verify: pnpm --filter @harness/kb typecheck && pnpm --filter @harness/kb test && pnpm --filter @harness/kb build
---

# Stage 8 — Knowledge base and proposal generator · Sonnet 5

Follow `docs/RULES.md`. Read only what is in `requires` above.

## Status

`packages/kb/` currently has only a `package.json` and an empty `index.ts`
stub. This stage gives it real content under `src/`; delete the stale root
`index.ts` once `src/index.ts` exists. You will need workspace dependencies
on `@harness/contracts`, `@harness/islands`, and `@harness/engine` — add
each as `"workspace:*"` in `package.json`.

`packages/kb/tsconfig.json` also still carries the repo-skeleton pattern
(`"include": ["*.ts", "*.tsx"]`, root-level only — it will not match
anything under `src/`, including the nested `src/propose/` directory).
Update it to `"include": ["src/**/*.ts"]` and `"compilerOptions": { "noEmit":
true }` (no `outDir`/`exclude`), matching `packages/contracts/tsconfig.json`.
Add a new `packages/kb/tsconfig.build.json` extending it, with
`"compilerOptions": { "noEmit": false, "outDir": "./dist", "declaration":
true }` and `"exclude": ["src/**/*.test.ts"]`. Update `package.json`'s
`"build"` script to `"tsc -p tsconfig.build.json"` if it isn't already.

This is the last of the eight stages. Its legality filter (§14 step 3) is
the one place downstream of Stage 1/2 that calls back into both
`validate()` and `validateWithContracts()` — do not re-derive either; import
and call them.

## TASK

Implement the knowledge-base store, the precedence ordering function, the
experiment→KB ingest rule, and the deterministic proposal-generation
algorithm.

## OUTPUTS

### `packages/kb/src/store.ts` + colocated test

CONTRACTS §13.3:

```ts
function loadKB(path: string): KBFile;
function saveKB(path: string, kb: KBFile): void;
```

`KBFile = { schema_version: 1; records: KBRecord[] }`. `KBRecord` includes
`scope: KBScope` (§13.1: `route_id`, `renderer`, `hydration`, `render_mode`,
`data_strategy`, each `X | null`, `null` = "any"), `claim: KBClaim` (§13.2:
`direction: "improves"|"regresses"|"neutral"`, `reward_delta: number`,
`vetoed: boolean`), `evidence: { experiment_id: string | null; sample_size:
number }`, `source: "measured"|"seeded"`, `status: "active"|"superseded"`.

### `packages/kb/src/precedence.ts` + colocated test

CONTRACTS §13.5 — implement `precedes` **exactly as written**, do not
re-derive or approximate it:

```ts
function specificity(s: KBScope): number;  // count of non-null scope fields, 0–5

function precedes(a: KBRecord, b: KBRecord): boolean {
  if (a.source !== b.source) return a.source === "measured";
  const sa = specificity(a.scope), sb = specificity(b.scope);
  if (sa !== sb) return sa > sb;
  if (a.evidence.sample_size !== b.evidence.sample_size)
    return a.evidence.sample_size > b.evidence.sample_size;
  if (a.created_at !== b.created_at) return a.created_at > b.created_at;
  return a.kb_id > b.kb_id;
}

function query(records: KBRecord[], q: {
  route_id: string; renderer: Renderer; hydration: Hydration;
  render_mode: RenderMode; data_strategy: DataStrategy;
}): KBRecord | null;
```

A scope applies to a query iff every non-null scope field equals the
corresponding query field. `query` returns the winning **applicable**
**active** record by `precedes`, or `null` if none applies.

Test MUST include a precedence table exercising every tiebreak level in
order: measured-vs-seeded, then specificity, then sample size, then
`created_at` recency, then `kb_id` as the final deterministic tiebreak.

### `packages/kb/src/ingest.ts` + colocated test

CONTRACTS §13.4:

```ts
function ingest(kb: KBFile, result: ExperimentResult, proposal: Proposal): KBRecord;
```

`scope.route_id = target_route_id`; the mutated dimension (from
`proposal.mutation.kind`) gets the mutation's new value; other dimension
fields `null`. `direction`: `accept→improves`, `reject|veto→regresses`,
`inconclusive→neutral`. `reward_delta = result.reward_delta`; `vetoed =
(verdict === "veto")`; `evidence = { experiment_id, sample_size: n_per_arm
}`; `source = "measured"`; `status = "active"`. **Supersede rule**: any
existing `active` record with an identical `scope` (all 5 fields equal) and
same `source` is set to `superseded`. Mutates `kb` in place; returns the new
record.

Test MUST include an ingest/supersede round trip for each of the four
verdicts.

### `packages/kb/src/propose/generate.ts` + colocated test

CONTRACTS §14 — implement the six-step algorithm **verbatim**:

```ts
function propose(opts: {
  site: ResolvedSiteConfig;
  contracts: IslandContract[];
  kb: KBFile;
  scan: MeasurementSample[];   // arm "scan", SCAN_SAMPLES per route, baseline profile
}): Proposal | null;
```

1. **Target selection**: for each route, mean per-sample reward
   (`sampleReward` from `@harness/engine`) over its scan samples; target =
   lowest mean, ties broken by lexicographically smallest `route_id`.
2. **Candidate enumeration**, exact order: dimensions
   `[set_hydration, set_renderer, set_render_mode, set_data_strategy]`; for
   island-scoped kinds, target route's islands in config order, then the
   dimension's enum values in canonical order (CONTRACTS §2), skipping the
   current value; route-scoped kinds iterate enum values in canonical
   order, skipping the current value.
3. **Legality filter**: apply the candidate mutation to a copy of the site;
   drop if `validate()` (from `@harness/contracts`) or
   `validateWithContracts()` (from `@harness/islands`) would report any
   C-code or S013/S011/S012 on the mutated copy — call these functions, do
   not re-derive their rules. A `set_data_strategy` mutation to `"none"` is
   legal only if no island on the route requires `data`; a mutation FROM
   `"none"` is always dropped (no `data_url` exists to serve it).
4. **KB filter**: for each surviving candidate, query the target route +
   post-mutation placement tuple of the affected island (route-scoped
   mutations: evaluate every island, take the highest-precedence winner
   among per-island winners, ties per `precedes`; islandless routes query
   with `renderer`/`hydration` null). Drop the candidate if the winning
   record's `direction === "regresses"`.
5. **Ranking**: `"improves"`-winning candidates first, ordered by that
   record's `reward_delta` descending (ties: enumeration order); then all
   remaining candidates in enumeration order.
6. **Emit**: a `Proposal` (status `"pending"`) for the first ranked
   candidate, `rationale_kb_ids = [winning record's kb_id]` or `[]`. If no
   candidates survive, return `null`.

Tests MUST include: generator determinism (identical inputs → identical
proposal); the step-3 legality drops for mutation to/from
`data_strategy "none"`; a KB-filter case where a `"regresses"` record
eliminates the otherwise-first candidate.

### `packages/kb/src/index.ts`

Barrel matching `docs/PUBLIC_API.md`'s `@harness/kb` `"."` export
(`specificity, precedes, query, loadKB, saveKB, ingest`), plus `propose`.

## DOCUMENTATION OUTPUT (required)

Also produce `docs/decisions/08-kb-and-proposals.md` using exactly this
structure:

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

`pnpm --filter @harness/kb typecheck && pnpm --filter @harness/kb test && pnpm --filter @harness/kb build`
