---
stage: 7
name: experiment-runner
model: Opus 5
write_scope: packages/experiment/src/**
requires:
  - docs/RULES.md
  - docs/REWARD.md
  - docs/CONTRACTS.md#§1.1
  - docs/CONTRACTS.md#§10
  - docs/CONTRACTS.md#§12
  - docs/CONTRACTS.md#§15
  - docs/PUBLIC_API.md
  - packages/experiment/package.json
  - packages/experiment/tsconfig.json
  - packages/contracts/src/types.ts
  - packages/contracts/src/resolve.ts
  - packages/build/src/build.ts
  - packages/measure/src/serve.ts
  - packages/measure/src/collect.ts
  - packages/reward/src/decide.ts
  - site.config.json
  - islands/contracts.json
  - fixtures/catalog.json
  - fixtures/dashboard.json
provides:
  - packages/experiment/src/run.ts
  - packages/experiment/src/run.test.ts
  - packages/experiment/src/index.ts
  - packages/experiment/tsconfig.json
  - packages/experiment/tsconfig.build.json
verify: npx playwright install chromium && pnpm --filter @harness/experiment typecheck && pnpm --filter @harness/experiment test && pnpm --filter @harness/experiment build
---

# Stage 7 — Experiment runner · Opus 5

Follow `docs/RULES.md`. Read only what is in `requires` above.

**Model note:** escalated from Sonnet 5 to Opus 5 after Stage 2.6 review.
This orchestration has no cooldown or concurrent-proposal logic — CONTRACTS
§12's `runExperiment` doesn't specify either, and neither belongs in this
stage's OUTPUTS (that would be an old-plan invention with no frozen basis;
see `prompts/STAGE_MAP.md`). The escalation is instead because getting the
sequential orchestration subtly wrong — a swapped baseline/variant profile,
a miscounted sample, wrong `run_index` ordering in the JSONL, a status
transition applied to the wrong proposal — produces a plausible-looking but
silently wrong `ExperimentResult` with no crash to signal it. That is the
same class of statistically-silent-failure risk Stage 6 carries, even though
the two stages' actual logic differs.

## Status

`packages/experiment/` currently has only a `package.json` and an empty
`index.ts` stub, named `@harness/experiment` (renamed from
`@ultimate-frontend/experiment` during the Stage 2.5 recovery). Per
`docs/PUBLIC_API.md`'s note on the reward+experiment merge, this package is
**not published under its own npm name** — it is consumed internally by
`@harness/engine` (`packages/reward`) via a re-export, which is not your job
to wire (Stage 6 already has an `index.ts` that will eventually re-export
this package; that wiring happens whenever `packages/reward` next touches
its own `index.ts`, not here). Your job is this package's own content and
its own `pnpm --filter @harness/experiment` scripts. This stage gives it
real content under `src/`; delete the stale root `index.ts` once
`src/index.ts` exists. You will need a workspace dependency on
`@harness/contracts`, `@harness/build`, `@harness/measure`, and
`@harness/engine` — add each as `"workspace:*"` in `package.json`.

`packages/experiment/tsconfig.json` also still carries the repo-skeleton
pattern (`"include": ["*.ts", "*.tsx"]`, root-level only — it will not match
anything under `src/`). Update it to `"include": ["src/**/*.ts"]` and
`"compilerOptions": { "noEmit": true }` (no `outDir`/`exclude`), matching
`packages/contracts/tsconfig.json`. Add a new
`packages/experiment/tsconfig.build.json` extending it, with
`"compilerOptions": { "noEmit": false, "outDir": "./dist", "declaration":
true }` and `"exclude": ["src/**/*.test.ts"]`. Update `package.json`'s
`"build"` script to `"tsc -p tsconfig.build.json"` if it isn't already.

## TASK

Implement `runExperiment`: orchestrate baseline vs. variant builds, serve
both, collect samples, decide, and persist every artifact at its frozen
path.

## OUTPUTS

### `packages/experiment/src/run.ts` + colocated test

CONTRACTS §12:

```ts
function runExperiment(opts: {
  site: ResolvedSiteConfig;
  contracts: IslandContract[];
  proposal: Proposal;             // status "pending"; runner sets "testing" etc.
  n_per_arm?: number;             // DEFAULT: N_PER_ARM (91, §1.4)
  work_dir?: string;              // DEFAULT: repo root
}): Promise<ExperimentResult>;
```

Orchestration: `makeBaselineProfile` + `applyProposal` (both from
`@harness/contracts`) → `build` (from `@harness/build`) both profiles →
`serve` (from `@harness/measure`) → `collectMany` per arm on the target
route only → `decide` (from `@harness/engine`) → persist result, samples,
updated proposal.

Status machine (§10): `pending → testing → (accepted | rejected | vetoed |
inconclusive)`, mapped 1:1 from `decide`'s verdict
(`accept→accepted, reject→rejected, veto→vetoed, inconclusive→inconclusive`).
Terminal states have no transitions.

Persistence layout (§15, §12):

```
runs/proposals/<proposal_id>.json         updated Proposal
runs/experiments/<experiment_id>.json     ExperimentResult
runs/samples/<experiment_id>.jsonl        one MeasurementSample per line,
                                          baseline runs first then variant,
                                          each in run_index order
```

`experiment_id` format: `ex_<unix_ms>_<seq>` (§1.1).

Test: run one experiment on the reference site (`site.config.json`,
`islands/contracts.json`) with `n_per_arm: 3` (override — do not use the
production default of 91 in tests), mutating `home`'s `hero` island's
hydration `idle → visible` (a `set_hydration` `Mutation`, target route
`home`, island `hero`). Assert artifacts exist at the frozen paths above,
the result validates against `ExperimentResult`, and `n_per_arm` is echoed
as 3 in the result.

### `packages/experiment/src/index.ts`

Barrel exporting `runExperiment`. (No `docs/PUBLIC_API.md` exports-map entry
exists for this package on its own — it is consumed internally, per the
status note above.)

## DOCUMENTATION OUTPUT (required)

Also produce `docs/decisions/07-experiment.md` using exactly this
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

`npx playwright install chromium && pnpm --filter @harness/experiment typecheck && pnpm --filter @harness/experiment test && pnpm --filter @harness/experiment build`
