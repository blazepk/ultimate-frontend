# ADR-0013 — pnpm workspace (`packages/*`) supersedes CONTRACTS §15's flat `src/` layout

**Status:** accepted (amends CONTRACTS.md v1 — §15's layout paragraph only; every
other section, type, constraint, budget, and module surface in CONTRACTS.md is
unchanged by this ADR)

## Context

Stage 1 (repo skeleton) built a pnpm workspace of `packages/{contracts,islands,
renderers,build,measure,reward,experiment,kb}` plus `apps/site`. CONTRACTS.md
§15 specified a flat `src/contracts/…`, `src/islands/…` tree with no workspace
at all. A third prompt (packages/flags/) diverged from both. Stage 2.5 exists
to reconcile this three-way split; see `docs/RECONCILIATION.md` for the full
diagnosis.

`docs/PUBLIC_API.md` was introduced specifically to settle the packages/* vs
src/* question. Its reasoning: optional peer dependencies per renderer
(install React without pulling in Svelte's compiler) require a real
`package.json` boundary per adapter, which a flat `src/` tree cannot express.
§15 was written before the project's design settled on being a distributable
multi-package library.

## Decision

The pnpm workspace is authoritative. §15's layout paragraph is amended to
point at `packages/<name>/src/…` instead of `src/…`, using the npm-name
mapping in `docs/PUBLIC_API.md`. Every file-to-stage assignment, every
constraint, budget, type, and module signature elsewhere in CONTRACTS.md is
unchanged — this ADR touches nothing but where the code for those things
physically lives.

This is deliberately the *only* CONTRACTS.md amendment this reconciliation
makes. `docs/PUBLIC_API.md`'s first draft also proposed changes to eight
frozen vocabulary items (renderer union, tier names, RUM/beacon, reward
weights, sample-size parameters, and three module surface names) with no
argument connecting those changes to the layout question. Diagnosis in
`docs/RECONCILIATION.md` §A.3 traced all eight to a pre-Stage-0 planning
document with zero occurrences in any frozen doc. Human ruling confirmed:
CONTRACTS.md stays authoritative on all eight; `docs/PUBLIC_API.md` was
corrected to match instead. None of that is CONTRACTS.md's problem to fix,
and none of it is amended here.

## Alternatives rejected

- **Migrate the workspace back to flat `src/`, discard `packages/*`** —
  would throw away already-built and already-verified Stage 1/2 work, and
  does not solve the stated technical problem (per-renderer optional peers
  genuinely need separate `package.json` files; a flat tree cannot express
  "install `preact` without installing `svelte`").
- **Amend CONTRACTS.md's vocabulary to match PUBLIC_API's contaminated
  first draft** — rejected on the evidence in `docs/RECONCILIATION.md` §A.3:
  every one of those eight items traces to template residue, not a reasoned
  design proposal, and adopting them would silently reverse ADR-0001 (renderer
  union), ADR-0005 (tier budgets), ADR-0006 (lab-only measurement), ADR-0007
  (frozen reward weights), and ADR-0008 (frozen sample size) with no new
  evidence offered for any of the five reversals.
- **Leave §15 unedited and treat `packages/*` as an informal, undocumented
  convention** — leaves the exact ambiguity that caused this recovery in
  place for every future stage prompt to rediscover independently.

## Cost

Stage 2's executed artifacts (`packages/flags/*`) are migrated into
`packages/contracts/src/`, with one rename (`schema.ts` → `types.ts`, to match
§15's own file name rather than keep the file's existing convenient name — see
`docs/decisions/02-reconciliation.md`) and two discarded identifiers
(`resolveRoute`, `ResolvedIslandPlacement` — no frozen basis). All nine
existing package.json `name` fields are renamed from `@ultimate-frontend/*` to
`@harness/*` per `docs/PUBLIC_API.md`. Full cost accounting is in
`docs/decisions/02-reconciliation.md`.

## Revisit when

A future package boundary need arises that the current `packages/*` split
cannot express cleanly (mirroring the exact technical argument that justified
this decision), or if consolidating back toward fewer packages is later
justified by evidence rather than convenience.
