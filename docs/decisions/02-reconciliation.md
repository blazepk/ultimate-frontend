# Decision Record 02 — Stage 2.5 Reconciliation

| | |
|---|---|
| **Date** | 2026-07-26 |
| **Status** | Executed |
| **Driver** | Stage 2.5 (Reconciliation), run interactively with human review of the Phase 1 diagnosis before any write |
| **Related** | `docs/RECONCILIATION.md` (full diagnosis + Phase 2 decision table), `docs/PUBLIC_API.md` (revised), `docs/CONTRACTS.md` §15 (amended), `docs/adr/0013-packages-workspace-supersedes-flat-src-layout.md`, `docs/OPEN_QUESTIONS.md` entries 4–8 (resolved) |

## Summary

Stage 2 (a prompt executed under the label "Stage 2," distinct from
`docs/STAGE_INPUTS.md`'s own Stage 2 — see §5 below) built
`packages/flags/{schema,constraints,resolve,budget}.ts`, a directory matching
neither `docs/CONTRACTS.md` §15's frozen flat `src/` layout nor the
`packages/*` workspace Stage 1 had actually built. `docs/PUBLIC_API.md` was
introduced to settle package layout authoritatively, decided in favor of the
`packages/*` workspace, and was reviewed by a human before execution because
its first draft additionally proposed — without argument — eight changes to
vocabulary that CONTRACTS.md and its ADRs already freeze. Diagnosis
(`docs/RECONCILIATION.md` §A.3) traced all eight to a pre-Stage-0 planning
document with zero occurrences in any frozen doc.

Five rulings (F.1–F.5) were obtained from human review. This record documents
what was decided, why, what it cost, and three findings that don't fit
neatly into the F.1–F.5 rulings but must not be lost.

## Decisions

### F.1 — npm scope: `@harness/*`

**Decision:** all nine existing packages renamed from `@ultimate-frontend/*`
to `@harness/*`. `apps/site` left unrenamed — it is not a published package
and has no row in `docs/PUBLIC_API.md`.

**Cost:** nine `package.json` name-field edits (mechanical). Every future
stage prompt's VERIFY command must use the new names
(`pnpm --filter @harness/<name> …`), not the old `@ultimate-frontend/*` or the
bare `flags` that Stage 2's own VERIFY used.

### F.2 — CONTRACTS.md authoritative on all 8 vocabulary contradictions

**Decision:** `docs/PUBLIC_API.md` amended to conform to CONTRACTS.md;
CONTRACTS.md's vocabulary untouched. The eight corrections:

| Item | PUBLIC_API said | Corrected to |
|---|---|---|
| Renderer union | `react, qwik, svelte, solid` | `react, preact, svelte, vanilla` (CONTRACTS §2, ADR-0001) |
| Tiers | numeric 0–4 | `critical, standard, deferred` (CONTRACTS §2, §8.2, ADR-0005) |
| RUM | `./beacon` export, injectable beacon endpoint | removed entirely (ADR-0006 rejects RUM/field collection explicitly) |
| Measurement peer | `lighthouse` optional peer | removed (ADR-0006 rejects Lighthouse explicitly, by name) |
| Reward weights | injectable | fixed (REWARD.md §3, ADR-0007) |
| Sample size | injectable | fixed (REWARD.md §6, ADR-0008); `n_per_arm?` stays a test-only override, not public config |
| Measure surface | `tier0, tier1, determinism` | `serve, collectSample, collectMany` (CONTRACTS §11.3) |
| KB surface | `query, write, merge, compat` | `specificity, precedes, query, loadKB, saveKB, ingest` (CONTRACTS §13.5) |
| Contracts surface | `types, defineConfig, resolve, budget` | `types, validate, resolve, makeBaselineProfile, applyProposal, checkBudget` (CONTRACTS §5.4) |

**Cost:** none to code — this was entirely a documentation correction to a
PROPOSED (never-executed-against) file. Zero CONTRACTS.md content changed
except §15's layout paragraph (see ADR-0013).

### F.3 — Budget/veto split

**Decision:** `checkBudget()` (pure per-metric threshold check) stays in
`@harness/contracts` (`packages/contracts/src/budget.ts`, migrated unchanged
from Stage 2's work). V001's baseline-comparison conjunct — "`mean_v(m) >
budget(m)` **and** `mean_v(m) > mean_b(m)`" (REWARD.md §5) — is new code in
`@harness/engine` (`packages/reward/src/veto.ts`, `checkV001BudgetBreach`),
composing on top of `checkBudget` rather than duplicating its logic.

**Endorsed deviation, kept as instructed:** `breaching_fields` is an array,
not a single field. Stage 2's own reasoning stands: a metrics object can
breach several budgets in the same arm, and reporting only one would hide the
rest. This is now load-bearing in `checkV001BudgetBreach` too (it filters
`breaching_fields`, not a single value).

**Cost:** `packages/reward` gains a workspace dependency on `@harness/contracts`
(`"@harness/contracts": "workspace:*"`), and its `package.json` name changes
from `@ultimate-frontend/reward` to `@harness/engine` (the published name for
the reward+experiment merge — see `docs/PUBLIC_API.md`'s note on that pairing).
Its directory stays `packages/reward`; only the npm name changes.

**Explicitly NOT done:** V002 (a11y), V003 (hydration failures), V004
(runtime errors), V005 (metric collapse) are not implemented. All four need
`MeasurementSample`/`SampleFlags` (CONTRACTS §11.1), which no package yet
defines. `checkV001BudgetBreach` is deliberately named differently from
REWARD.md §8's frozen `evaluateVetoes(baseline, variant, budgets): VetoCode[]`
so it is not mistaken for satisfying that complete, five-veto obligation —
that remains full Stage 6 work once Stage 5 produces real samples.

### F.4 — `packages/islands` added, `packages/agent` dropped

**Decision:** `docs/PUBLIC_API.md` now has an `@harness/islands` row
(`packages/islands`, depends on contracts) documenting that it owns
`validateWithContracts`, `validateContracts` (CONTRACTS §5.4), and
`validateRegistry` (§7.4) — and, critically, constraint C005 (§4.3). The
`@harness/agent` row is removed; no stage in `docs/STAGE_INPUTS.md` produces
it.

**Cost:** none — `packages/islands` already existed as an empty Stage-1 stub;
this was a documentation-only correction. No `packages/agent` directory ever
existed, so nothing was deleted.

### F.5 — `packages/build` stays CONTRACTS §9.2; Astro deferred

**Decision:** `@harness/build` implements CONTRACTS §9.2's `build(profile,
opts): Promise<BuildManifest>` via esbuild. The `@harness/astro` row (Astro
integration, Vite plugin, `harness` CLI bin) is removed from
`docs/PUBLIC_API.md` entirely — not merely deferred silently, but recorded as
a tracked gap.

**Cost / known gap, tracked but not resolved here:** `apps/site` (the Astro
scaffold from the repo-skeleton stage) is now claimed by no package in
`docs/PUBLIC_API.md`. This predates Stage 2's divergence and this
reconciliation's scope was Stage 2's orphan specifically — `apps/site`'s fate
is left for a future decision, not resolved by fiat here. Flagged so it isn't
mistaken for an oversight.

## Three independent findings, flagged so they are not lost

These surfaced during diagnosis but are not F.1–F.5 rulings — recording them
per explicit instruction.

1. **`validate()` (CONTRACTS §5.4) was never built.** Neither the original
   `packages/flags/` work nor this reconciliation implements it. It is a hard
   prerequisite for Stage 8 (§14 step 3's legality filter runs `validate` +
   `validateWithContracts` on a mutated copy). Whichever stage next touches
   `packages/contracts` should build it before Stage 8 is attempted, or Stage
   8 will halt on a missing dependency that isn't obviously missing until it's
   needed.

2. **The C005 "Stage 2" numbering mismatch was a citation error, not a
   substance error.** Stage 2's own report said C005 was "explicitly Stage 2's
   job per CONTRACTS §5.4" while executing under a prompt also labelled
   "Stage 2" — reading that as self-reference is wrong; read against
   `docs/STAGE_INPUTS.md`'s numbering (where Stage 2 = `packages/islands`,
   distinct from the executed prompt sequence) it is exactly correct. The
   deferral itself was the right call — C005 needs `IslandContract` data that
   was never in the executing prompt's INPUTS. Two numbering schemes exist in
   this repo's history (see `docs/RECONCILIATION.md` §D for the full mapping);
   future stage prompts should cite `docs/STAGE_INPUTS.md`'s numbers
   exclusively to prevent this recurring.

3. **The `breaching_fields` array-shape deviation is endorsed, not merely
   tolerated.** Recorded explicitly here per instruction: Stage 2's choice to
   return every breaching metric rather than "the" (singular) breaching field
   was correct engineering judgment under ambiguity, not a deviation to
   correct. It is now propagated into `checkV001BudgetBreach` as well.

## Consequences

- `packages/flags/` no longer exists.
- `packages/contracts/src/` now holds `types.ts` (renamed from `schema.ts` —
  CONTRACTS §15 names the file `types.ts`; per instruction, painful migrations
  are done rather than amending CONTRACTS for convenience), `constraints.ts`,
  `resolve.ts` (narrowed — orphan identifiers dropped), `budget.ts`
  (unchanged), and `index.ts` (new barrel matching PUBLIC_API's exports map).
- `packages/reward/src/veto.ts` is new: V001 only, explicitly scoped.
- Nine `package.json` files renamed. `packages/reward` additionally renamed
  to `@harness/engine` (not `@harness/reward` — see `docs/PUBLIC_API.md`'s
  reward+experiment merge note) and gained a workspace dependency.
- `docs/CONTRACTS.md` §15's layout paragraph amended by `docs/adr/0013-…md` —
  the only CONTRACTS.md content this reconciliation touches.
- `docs/OPEN_QUESTIONS.md` entries 4–8 all carry resolution or re-scope notes;
  none are dangling.
- Two known gaps remain, tracked rather than resolved: `validate()` unbuilt
  (finding 1, above), and `apps/site` unclaimed by any `docs/PUBLIC_API.md`
  package (F.5's cost note).
