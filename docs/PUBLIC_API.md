STATUS: RECONCILED — layout decision ratified by `docs/adr/0013-packages-workspace-supersedes-flat-src-layout.md`. Vocabulary conforms to `docs/CONTRACTS.md` per human ruling. See `docs/decisions/02-reconciliation.md` for the full record and `docs/RECONCILIATION.md` for the diagnosis this revision resolves.

# Public API — package layout and exports

Resolves the divergence between CONTRACTS.md §15 (flat `src/contracts/...`) and the
actual repo tree (`packages/{contracts,islands,renderers,build,measure,reward,
experiment,kb}` + `apps/site`).

**Decision: the pnpm workspace (`packages/*`) is authoritative. CONTRACTS.md §15's
layout paragraph is amended (ADR-0013) to match. Nothing else in CONTRACTS.md changes.**

Reasoning:
- Optional peer dependencies per renderer (install React without pulling in Svelte)
  require separate `package.json` files per adapter. A flat `src/` tree cannot express
  this.
- §15 was authored before the project became a distributable multi-package library;
  it encoded a single-repo assumption the workspace has already superseded.
- Stage 1 and Stage 2 already built and verified against the workspace form.

**Revision note (this version):** the previous version of this document additionally
proposed changes to several *vocabulary* items that CONTRACTS.md and its ADRs already
freeze — a different renderer union, numeric tiers, a RUM beacon, injectable reward
weights and sample-size parameters, and non-frozen function names on several module
surfaces. Diagnosis in `docs/RECONCILIATION.md` §A.3 traced every one of those to
`files/adaptive-frontend-harness-prompt.md`, a pre-Stage-0 planning document with zero
occurrences in any frozen doc — carried-over template residue, not a reasoned proposal.
Human ruling confirmed: CONTRACTS.md is authoritative on all of them; this revision
corrects PUBLIC_API.md to match. Only the packages/* layout decision above survives
from the original version, because it is independently justified from the repo tree
and cited no contaminated vocabulary.

This revision also adds the `@harness/islands` row (missing from the original — the
package that owns constraint C005 and would have been deleted had Phase 3 executed
literally against the incomplete original) and removes the `@harness/agent` row (no
stage in `docs/STAGE_INPUTS.md` produces it) and the `@harness/astro` row (Astro/CLI
packaging is deferred; `packages/build` stays scoped to CONTRACTS §9.2).

---

## Package → npm name → directory

| Package | npm name | Directory | Depends on |
|---|---|---|---|
| Contracts | `@harness/contracts` | `packages/contracts` | — |
| Islands | `@harness/islands` | `packages/islands` | contracts |
| Renderers | `@harness/renderers` | `packages/renderers` | contracts |
| Build | `@harness/build` | `packages/build` | contracts, renderers |
| Measure | `@harness/measure` | `packages/measure` | contracts |
| KB | `@harness/kb` | `packages/kb` | contracts |
| Engine | `@harness/engine` | `packages/reward` | contracts |
| Experiment | `@harness/experiment` | `packages/experiment` | contracts, build, measure, engine |

**Note on `packages/flags/`**: this was Stage 2's orphan (a directory named by a
prompt template that predated Stage 0 and matched neither CONTRACTS §15 nor the
actual Stage 1 skeleton). It merges into `packages/contracts` — schema/types,
constraints, resolve, and the budget threshold check all live there as
`@harness/contracts`'s implementation, not as a separate published package. Stage 2.5
migrates `packages/flags/*` into `packages/contracts/src/` and deletes the orphan
directory. See `docs/decisions/02-reconciliation.md` for the full migration record,
including the two identifiers (`resolveRoute`, `ResolvedIslandPlacement`) that had no
frozen basis and were discarded rather than migrated.

**Note on `packages/islands/`**: owns CONTRACTS §5.4's `validateWithContracts` /
`validateContracts` and §7.4's `validateRegistry`, and is where constraint C005
(`EVENTS_REQUIRE_JS`, §4.3) is actually checked — it depends on `IslandContract` data
that `packages/contracts` never has reason to load. Absent from the original version
of this document; added during Stage 2.5 reconciliation.

**Note on `packages/build/`**: implements CONTRACTS §9.2 exactly — `build(profile,
opts): Promise<BuildManifest>` via esbuild, emitting `dist/<profile_id>/{static,
server,assets,data}`. It is not an Astro integration, a Vite plugin, or a CLI. Astro/CLI
packaging (`@harness/astro` in the prior version of this document) is deferred pending
its own contract section — no stage in `docs/STAGE_INPUTS.md` currently owns it, and
`apps/site` (the Astro scaffold from the repo-skeleton stage) is not yet claimed by any
package in this document. That is a tracked gap, not something this revision resolves.

**Note on `packages/reward/` + `packages/experiment/`** (corrected — see
`docs/decisions/07-experiment.md`): a prior version of this document proposed
publishing both under a single `@harness/engine` name via a re-export at
`packages/reward/src/index.ts` that also re-exported `packages/experiment`. That
cannot work: `packages/experiment/src/run.ts` imports `decide` from
`@harness/engine` (REWARD.md §8 freezes `decide` at `src/reward/decide.ts`), so the
proposed re-export would close a dependency cycle (`engine → experiment → engine`).
**Decision: they ship as two separate public packages, `@harness/engine`
(`packages/reward`) and `@harness/experiment` (`packages/experiment`), with no
re-export between them.** `@harness/experiment` depends on `@harness/engine`, never
the reverse. This was found and fixed during Stage 7 (see
`docs/OPEN_QUESTIONS.md` #16, RESOLVED).

---

## Exports maps

```
@harness/contracts
  "."              → src/index.ts        (types, validate, resolve, makeBaselineProfile,
                                          applyProposal, checkBudget)
  "./constraints"  → src/constraints.ts  (internal, not part of stable surface — export
                                          anyway since Stage 6 needs direct access)

@harness/islands
  "."              → src/index.ts        (validateWithContracts, validateContracts,
                                          validateRegistry)

@harness/renderers
  "."              → src/index.ts        (adapter registry, detection)
  "./react"        → src/react/index.ts
  "./preact"       → src/preact/index.ts
  "./svelte"       → src/svelte/index.ts
  "./vanilla"      → src/vanilla/index.ts

@harness/build
  "."              → src/index.ts        (build, BuildManifest — CONTRACTS §9.2)

@harness/measure
  "."              → src/index.ts        (serve, collectSample, collectMany — CONTRACTS §11.3)

@harness/kb
  "."              → src/index.ts        (specificity, precedes, query, loadKB, saveKB, ingest)

@harness/engine
  "."              → src/index.ts        (normalize, sampleReward, armStats,
                                          evaluateVetoes, decide — REWARD.md §8)

@harness/experiment
  "."              → src/index.ts        (runExperiment — CONTRACTS §12)
```

Anything not listed above is internal to its package and may change without a major
version bump.

---

## Peer dependency matrix

| Package | Peer | Optional | Detected via |
|---|---|---|---|
| `@harness/renderers` | `react`, `react-dom` | yes | `require.resolve` in adapter, caught |
| `@harness/renderers` | `preact` | yes | same |
| `@harness/renderers` | `svelte` | yes | same |
| `@harness/measure` | `playwright` | **no — required** | CONTRACTS §11.2: all measurement is headless-Chromium-via-Playwright, no fallback |

`vanilla` is always available and has no peer dependency. `qwik`, `solid-js`, and
`lighthouse` were in the prior version of this document and are removed: the renderer
union is frozen at `react|preact|svelte|vanilla` (CONTRACTS §2, ADR-0001, which
explicitly rejected Solid), and ADR-0006 explicitly rejected Lighthouse as the
measurement collector.

A config naming a renderer whose peer isn't installed fails validation with the
renderer name and install command — never a bare module-resolution error.

---

## Consumer-injectable vs fixed

**Fixed** (cannot be overridden by `harness.config.ts`):
- Flag dimensions (`renderer`, `hydration`, `render_mode`, `data_strategy`) — closed
  unions, CONTRACTS §2
- The constraint table (illegal combinations) — CONTRACTS §4
- KB precedence rules — CONTRACTS §13.5
- Tier definitions (`critical`/`standard`/`deferred`) and their latency budgets —
  CONTRACTS §8.2
- Reward weights and metric normalization thresholds — REWARD.md §2–§3, frozen per
  ADR-0007 so experiments stay comparable over time
- Sample-size parameters (α, power, assumed σ, target δ, and the derived
  `N_PER_ARM = 91`) — REWARD.md §6, frozen per ADR-0008; the `n_per_arm?` override on
  `runExperiment` (CONTRACTS §12) is a test-only escape hatch, not public config

**Injectable** (consumer supplies via `harness.config.ts`):
- Per-route/per-island budgets (CONTRACTS §3.2 `budgets?`, merged per §8.2)
- Renderer allowlist (subset of installed peers)

---

## Semver policy

**Major** version bump required for: any change to reward normalization functions, any
addition/removal to the constraint table, any change to KB precedence order, any change
to `RendererAdapter`'s required members, any narrowing of what's consumer-injectable.

**Minor**: new optional adapter, new CLI command, new injectable config field with a
default.

**Patch**: everything internal (anything not in an exports map above).

---

## Resolved — human review

The prior "Open item for human review" is resolved. Rulings received (dated in
`docs/decisions/02-reconciliation.md`):

- F.1 — npm scope is `@harness/*`. All nine existing packages renamed from
  `@ultimate-frontend/*`; `apps/site` is left unrenamed (not a published package, no
  row in this document).
- F.2 — CONTRACTS.md is authoritative on all eight vocabulary contradictions; this
  document was amended to match, CONTRACTS.md was not.
- F.3 — budget/veto split: threshold check stays in `@harness/contracts`; V001's
  baseline-comparison rule is implemented in `@harness/engine` (packages/reward) per
  REWARD.md §8.
- F.4 — `@harness/islands` row added; `@harness/agent` row dropped.
- F.5 — `packages/build` stays CONTRACTS §9.2; Astro/CLI packaging deferred.
