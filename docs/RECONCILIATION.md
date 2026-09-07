# RECONCILIATION.md — Stage 2.5 Phase 1 (Diagnosis)

**Status: PHASE 1 COMPLETE — read-only. No code moved, no docs amended, no ADR
written.** Phases 2 (DECIDE) and 3 (EXECUTE) are held pending human review of
this document, per Stage 2.5's instruction to run in plan mode first.

**Headline finding.** `docs/PUBLIC_API.md` resolves the `packages/*` vs `src/*`
split cleanly and its reasoning for that decision is sound. But PUBLIC_API.md
*also* contradicts frozen CONTRACTS.md on closed vocabularies and frozen
constants in eight further places that its own reasoning section never mentions.
Per Phase 1(a), CONTRACTS ↔ PUBLIC_API disagreement "is a Stage 0 defect and
changes the remedy" — so it does. Phase 2 cannot proceed as a straightforward
MIGRATE until the human resolves §A.3 below.

**Root cause of the secondary contradictions is the same bug this recovery
exists to fix.** Every contradicted identifier (`qwik`, `solid`, `@harness/*`,
numeric tiers 0–4, RUM beacon) traces to `files/adaptive-frontend-harness-prompt.md`,
the pre-Stage-0 brief. Verified counts:

| Identifier | Occurrences in `files/*` (pre-Stage-0) | Occurrences in frozen docs |
|---|---:|---:|
| `qwik`, `solid` | 3 files | **0** |
| `@harness/*` | 6 files | **0** |
| numeric tiers 0–4 | present | **0** (frozen docs use `critical`/`standard`/`deferred`) |
| RUM beacon | present | **0** (ADR-0006 rejects RUM explicitly) |

PUBLIC_API.md is therefore *partially* contaminated by the same template residue
that produced `packages/flags/`. Its layout decision is freshly derived from the
repo tree and should stand. Its vocabulary is carry-over and should not.

---

## (a) The authoritative package layout

### a.1 — CONTRACTS.md §15 (lines 1024–1053), quoted

```
src/contracts/{types,constraints,validate,resolve}.ts        Stage 1
src/islands/{contract,registry}.ts                           Stage 2
src/renderers/{adapter,scheduler,react,preact,svelte,vanilla}.ts  Stage 3
src/components/<contract_id>/{react.tsx,preact.tsx,svelte.svelte,vanilla.ts}  Stage 3
src/build/build.ts                                           Stage 4
src/measure/{serve,collect}.ts                               Stage 5
src/reward/{normalize,reward,veto,decide}.ts                 Stage 6
src/experiment/run.ts                                        Stage 7
src/kb/{store,precedence,ingest}.ts  src/propose/generate.ts Stage 8
```

A flat `src/` tree. No `packages/`, no workspace, no `apps/`.
`docs/STAGE_INPUTS.md` corroborates throughout: its VERIFY commands are
`npx vitest run src/contracts`, `npx vitest run src/islands`, and so on.

### a.2 — PUBLIC_API.md, quoted

Decision (lines 9–10):

> **Decision: the pnpm workspace (`packages/*`) is authoritative. CONTRACTS.md §15 is
> superseded and must be amended by ADR.**

Exports maps (lines 53–83):

```
@harness/contracts   "."→src/index.ts   "./constraints"→src/constraints.ts
@harness/renderers   "."→src/index.ts   "./react" "./qwik" "./svelte" "./solid"
@harness/measure     "."→src/index.ts   "./beacon"→src/beacon.ts
@harness/kb          "."→src/index.ts
@harness/engine      "."→src/index.ts   (re-exports reward + experiment)
@harness/astro       "."→src/integration.ts  "./vite-plugin"  bin: harness
@harness/agent       "."→src/index.ts
```

### a.3 — They disagree. Explicitly.

On layout, PUBLIC_API supersedes §15 and I accept that (see §E.1). On the
following, PUBLIC_API contradicts CONTRACTS.md **without argument** — its
reasoning block (lines 12–19) addresses only layout:

| # | Subject | CONTRACTS.md (frozen) | PUBLIC_API.md (proposed) | Severity |
|---|---|---|---|---|
| 1 | **Renderer union** | §2 L84: `"react" \| "preact" \| "svelte" \| "vanilla"` — closed | `./react ./qwik ./svelte ./solid`; peers `@builder.io/qwik`, `solid-js` | **Blocking.** Two of four members differ. ADR-0001 explicitly rejected "Solid/Vue renderers — more values without widening the spanned design space". Appendix A.2's reference site uses `preact` + `vanilla`. |
| 2 | **Tier vocabulary** | §2 L92: `"critical" \| "standard" \| "deferred"`; §8.2 budget table keyed on those | L112: "Tier definitions (0–4)" | **Blocking.** Five numeric tiers vs three named. Would void §8.2, REWARD.md §4, and ADR-0005. |
| 3 | **RUM / beacon** | ADR-0006 decides lab-only, rejecting "RUM/field collection"; §11.2 is Playwright-only | `@harness/measure "./beacon"`; L119 injectable "RUM beacon endpoint" | **Blocking.** Directly reverses a recorded ADR. |
| 4 | **Reward weights** | REWARD.md §3 freezes the seven weights; ADR-0007: "frozen to make experiments comparable over time" | L116: injectable "Reward weights" | **Blocking.** Consumer-tunable reward makes `KBRecord.reward_delta` incomparable across sites (§13.2). |
| 5 | **Sample size** | §1.4 freezes `N_PER_ARM = 91`; REWARD.md §6 derives it | L117: injectable "Minimum-sample-size parameters / target effect size" | **Needs ruling.** §12 already allows an `n_per_arm?` *test* override; elevating it to consumer config is broader. |
| 6 | **Measure surface** | §11.3: `serve`, `collectSample`, `collectMany` | L67: "(tier0, tier1, determinism)" | **Blocking.** No frozen identifier named `tier0`/`tier1`/`determinism` exists. |
| 7 | **KB surface** | §13.5: `specificity`, `precedes`, `query`, `loadKB`, `saveKB`, `ingest` | L71: "(query, write, merge, compat)" | **Blocking.** `write`/`merge`/`compat` are undefined; four frozen functions vanish. |
| 8 | **Contracts surface** | §5.4: `validate`, `resolve`, `makeBaselineProfile`, `applyProposal` | L55: "(types, defineConfig, resolve, budget)" | **Blocking.** `defineConfig` exists nowhere in frozen docs; three frozen functions omitted. |
| 9 | **Stage 4 artifact** | §9.2: `build(profile, opts) → BuildManifest`, emitting `dist/<profile_id>/{static,server,assets,data}` via esbuild | L33/L77–79: `packages/build` publishes `@harness/astro` — Astro integration + Vite plugin + `harness` CLI | **Blocking.** Categorically different deliverable for the same directory. |
| 10 | **`packages/islands`** | §15: `src/islands/{contract,registry}.ts`; §5.4 assigns `validateWithContracts` + C005 there | **No row, no exports map entry** | **Blocking.** Stage 2.5's own VERIFY forbids "any directory absent from PUBLIC_API's exports maps" — this would force deleting the package that owns C005. |
| 11 | **npm scope** | — (frozen docs name no npm scope) | `@harness/*` | **Needs ruling.** Repo actually declares `@ultimate-frontend/*`. Three schemes in play (see §B.2). |
| 12 | **`packages/agent`** | Absent from §15; no stage in STAGE_INPUTS produces it | L34: "new: `packages/agent`" | **Needs ruling.** A package with no owning stage is orphan-by-construction. |

Items 1–4, 6–10 are contradictions of *frozen* text by a *proposed* document.
Stage 2.5's charter permits AMEND "ONLY where you can demonstrate CONTRACTS is
internally inconsistent or contradicts PUBLIC_API.md" — but its DO NOT is
"do not amend CONTRACTS.md to make the existing code convenient," and the
bias is "hard toward MIGRATE." Amending eight closed vocabularies on the
strength of an unargued PROPOSED document would invalidate ADR-0001, 0005,
0006, 0007, all of Stage 2's shipped tests, and STAGE_INPUTS' Stage 3/5/6/8
rows. **I decline to make that call unilaterally.** See §F.

---

## (b) The actual repository tree, and its deviations

### b.1 — Tree as built

```
apps/site/                 @ultimate-frontend/site      Astro 4, output:"static"
packages/build/            @ultimate-frontend/build     index.ts (empty stub)
packages/contracts/        @ultimate-frontend/contracts index.ts (empty stub)
packages/experiment/       @ultimate-frontend/experiment index.ts (empty stub)
packages/flags/            flags                        4 impl + 4 test files ← Stage 2
packages/islands/          @ultimate-frontend/islands   index.ts (empty stub)
packages/kb/               @ultimate-frontend/kb        index.ts (empty stub)
packages/measure/          @ultimate-frontend/measure   index.ts (empty stub)
packages/renderers/        @ultimate-frontend/renderers index.ts (empty stub)
packages/reward/           @ultimate-frontend/reward    index.ts (empty stub)
docs/  files/  CLAUDE.md  pnpm-workspace.yaml  tsconfig.json  vitest.config.ts
```

### b.2 — Deviations from (a)

| # | Deviation | Against |
|---|---|---|
| B-1 | Workspace of `packages/*`, not flat `src/*` | CONTRACTS §15 — **resolved by PUBLIC_API in favour of the tree** |
| B-2 | Npm scope is `@ultimate-frontend/*` | PUBLIC_API says `@harness/*`. Neither appears in CONTRACTS. **Third scheme:** `packages/flags` declares bare `flags`, which is why VERIFY read `pnpm --filter flags`. |
| B-3 | `apps/site/` exists | Absent from CONTRACTS §15 entirely; PUBLIC_API references it only obliquely (L33) with no exports map |
| B-4 | `packages/flags/` exists | In neither (a) source. The original orphan. |
| B-5 | Eight packages hold empty `index.ts` stubs | Not a contradiction — Stage 1 scaffolding, awaiting their stages |
| B-6 | No `src/` subdirectory inside any package | PUBLIC_API's exports maps all assume `src/index.ts`; existing packages put `index.ts` at package root |
| B-7 | `packages/*/dist/` committed build output | `.gitignore` covers `dist/`; harmless, but they are stale artifacts of the skeleton build |
| B-8 | No `packages/agent/` | PUBLIC_API L34 requires it; no stage produces it |

---

## (c) Stage 2 artifacts under `packages/flags/`, mapped

Destination column assumes PUBLIC_API's note (L36–40): *"merges into
`packages/contracts` … Stage 2.5 migrates `packages/flags/*` into
`packages/contracts/src/` and deletes the orphan directory."*

| Artifact | Destination | Status |
|---|---|---|
| `schema.ts` | `packages/contracts/src/schema.ts` | **MIGRATE.** Content is a verbatim transcription of CONTRACTS §1.3, §2, §3, §5.1, §8.1. Sound. |
| `schema.test.ts` | `packages/contracts/src/schema.test.ts` | MIGRATE |
| `constraints.ts` | `packages/contracts/src/constraints.ts` | **MIGRATE.** Exact match to PUBLIC_API's `"./constraints" → src/constraints.ts`. |
| `constraints.test.ts` | `packages/contracts/src/constraints.test.ts` | MIGRATE |
| `resolve.ts` | `packages/contracts/src/resolve.ts` | MIGRATE **with corrections** — see §E.2 |
| `resolve.test.ts` | `packages/contracts/src/resolve.test.ts` | MIGRATE |
| `budget.ts` | **contested** — `packages/contracts/src/budget.ts` per PUBLIC_API L55, *or* `packages/reward/src/veto.ts` per REWARD.md §8 | **CONTESTED.** See §E.3 |
| `budget.test.ts` | follows `budget.ts` | CONTESTED |
| `package.json` (name `flags`) | — | **DISCARD.** Merges into the contracts package. |
| `tsconfig.json` | — | **DISCARD.** `packages/contracts/tsconfig.json` already exists. |
| `node_modules/.vite/` | — | **DISCARD.** Build cache. |

### c.1 — ORPHAN identifiers (distinct from orphan files)

Every *file* has a destination. But four *identifiers* Stage 2 invented appear
in no frozen artifact, and PUBLIC_API does not sanction them either:

| Identifier | In `packages/flags/` | Frozen basis |
|---|---|---|
| `PlacementTuple` | `constraints.ts` | **ORPHAN (name).** CONTRACTS §4 describes the placement tuple in prose and an unnamed code block, never as a named TS type. Concept is frozen; the name is invented. |
| `resolveRoute()` | `resolve.ts` | **ORPHAN.** No frozen signature. §5.4 defines only `resolve(config): ResolvedSiteConfig`. |
| `ResolvedIslandPlacement` | `resolve.ts` | **ORPHAN.** Return type of the above. |
| `checkBudget()`, `MetricMeans`, `BudgetCheckResult`, `BudgetMetricKey` | `budget.ts` | **ORPHAN.** REWARD.md §8 freezes `evaluateVetoes(baseline, variant, budgets): VetoCode[]` instead. |

Also **missing** from Stage 2 relative to CONTRACTS §5.4's contracts-package
surface: `validate()`, `makeBaselineProfile()`, `applyProposal()`. Stage 2's
report flagged the latter two as deliberately out of scope; `validate()` was
never built at all, and §14 step 3 (Stage 8) depends on it.

**Zero-ORPHAN target for Phase 3 VERIFY:** achieved for files by the migration
above; achieved for identifiers only once §F.2 rules on `resolveRoute` /
`PlacementTuple` (retain as documented internals, or delete).

---

## (d) Stage numbering — two schemes

They differ, and Stage 2's report conflated them.

| Executed prompt | Actually built | STAGE_INPUTS.md equivalent |
|---|---|---|
| *(unlabelled, "Stage 0")* | `docs/CONTRACTS.md`, `REWARD.md`, `STAGE_INPUTS.md`, `adr/0001–0012` | **none** — STAGE_INPUTS defines no stage that authors itself |
| "repo skeleton" | workspace, 8 package stubs, `apps/site`, CI | **none** — STAGE_INPUTS' Stage 1 row folds scaffolding into contract work |
| **"Stage 2"** | `packages/flags/{schema,constraints,resolve,budget}.ts` | **Stage 1** (contract types, validation, resolution) — *partially*; fixtures, `validate()`, `makeBaselineProfile`, `applyProposal`, and `kb/records.json` were not built |

So the executed scheme runs roughly one ahead of STAGE_INPUTS, and the executed
"Stage 2" performed a subset of STAGE_INPUTS **Stage 1**.

**Consequence for the C005 remark.** Stage 2's report said C005 "is explicitly
Stage 2's job per CONTRACTS §5.4 (`validateWithContracts`)". Reading that as the
*executed* Stage 2 (itself) is wrong; read against STAGE_INPUTS it is correct.
C005 belongs to **STAGE_INPUTS Stage 2**, which owns `src/islands/contract.ts` →
`packages/islands` — a package the executed Stage 2 never touched. The remark
was right about the owner and wrong about which numbering scheme it was citing.
See §E.4.

---

## (e) The four items from Stage 2's report — correct resolutions

### E.1 — `packages/flags/` location

**Resolution: MIGRATE into `packages/contracts`.** PUBLIC_API L36–40 is explicit
and its layout reasoning (optional per-renderer peers need real `package.json`
boundaries; §15 predates the distributable-library design; Stages 1–2 already
verified against the workspace) is sound and independently checkable against the
tree. `packages/flags` was never a published package in any plan — it was a
prompt-template artifact.

Cost, to be recorded in the decision record: the executed VERIFY
`pnpm --filter flags …` dies with the package name, so every downstream VERIFY
must be re-derived from the settled npm scope (§F.1).

### E.2 — `resolve()` signature and the missing per-island type

**Resolution: keep frozen `resolve()`; re-scope the extras.** CONTRACTS §5.4
freezes `resolve(config: SiteConfig): ResolvedSiteConfig` and Stage 2 implemented
exactly that — correct. The prompt's additional ask ("given SiteConfig + route
path, returns the resolved renderer/hydration/build profile for each island")
has **no frozen counterpart**: there is no per-island build-profile type in
CONTRACTS. §9.1's `BuildProfile` is per-*site* (`routes: ResolvedRouteConfig[]`),
not per-island.

Stage 2 correctly refused to invent a type and instead surfaced the placement
tuple. That was the right instinct. But `resolveRoute` / `ResolvedIslandPlacement`
remain unfrozen names. The closest frozen relative is §7.3's `IslandBootSpec`,
which is genuinely per-island — and is **Stage 3's** to build, not the contracts
package's. Recommended: retain `PlacementTuple` as a documented internal (it
names a concept CONTRACTS §4 does freeze), and either delete `resolveRoute` or
demote it to a test helper. Needs the §F.2 ruling.

Also flagged: `validate()` (CONTRACTS §5.4) is **absent** and is a hard
prerequisite for §14 step 3. Phase 3 should add it, or Stage 8 will halt.

### E.3 — `budget.ts` and veto V001

**Resolution: the rule is now knowable; its home is contested.**

REWARD.md §5 V001 fires when, for some metric m:

> `mean_v(m) > budget(m)` **and** `mean_v(m) > mean_b(m)`

Stage 2 implemented only the first conjunct, because REWARD.md was withheld from
its INPUTS — a correct halt-worthy gap that it instead (reasonably) logged as
ambiguity. With REWARD.md in hand the baseline-comparison conjunct is
implementable exactly.

**But the placement is contested.** REWARD.md §8 freezes this surface at
`src/reward/veto.ts` as `evaluateVetoes(baseline, variant, budgets): VetoCode[]`
— i.e. the **reward** package, STAGE_INPUTS Stage 6. PUBLIC_API L55 instead puts
"budget" in `@harness/contracts`. Stage 2.5's Phase 3 instruction ("complete
V001's baseline-comparison rule in budget evaluation") assumes the contracts
package. Three sources, two destinations.

Conservative recommendation: keep a **pure threshold check** in
`packages/contracts` (it needs only `RouteBudgets`, no arm data, no `VetoCode`)
and implement **V001 proper** in `packages/reward` per REWARD.md §8, where the
baseline arm is in scope. This satisfies both documents without duplicating the
rule. Needs the §F.3 ruling.

**Stage 2's array return shape is correct and must be preserved.** A metrics
object can breach several budgets at once; returning one field would hide the
rest. REWARD.md §5 quantifies over "some metric m" without limiting the count,
and `ExperimentResult.veto_codes` (§12) is itself an array. To be recorded in
the ADR as an endorsed deviation, per Stage 2.5's instruction.

### E.4 — C005 ownership

**Resolution: STAGE_INPUTS Stage 2 owns it — `packages/islands`.**

CONTRACTS §4.3 puts C005 (`EVENTS_REQUIRE_JS`: contract declares ≥1 event ∧
`hydration = "none"`) outside the 240-tuple space because it depends on
`IslandContract` data. §5.4 assigns it to `validateWithContracts`, and
STAGE_INPUTS Stage 2 places that at `src/islands/contract.ts` → `packages/islands`.

Stage 2's deferral was therefore **correct on the merits**: C005 was
un-implementable from its INPUTS, which carried no island-contract data. The
deferral was misattributed only in its numbering (§D).

This makes contradiction #10 (§A.3) urgent: PUBLIC_API has no `@harness/islands`
row, and Phase 3's VERIFY would delete any directory absent from its exports
maps. Executing that literally would **delete the package that owns C005**, plus
`validateWithContracts`, `validateContracts`, `validateRegistry`, R001 and R002.
Appendix B vectors B3 and B6–B9 would become unimplementable. PUBLIC_API is
incomplete here, not authoritative.

---

## (f) Rulings required before Phase 2

I can execute E.1, E.2's frozen half, E.3's array shape, and E.4's attribution
without further input. These I cannot:

**F.1 — Npm scope.** `@harness/*` (PUBLIC_API) vs `@ultimate-frontend/*` (actual
tree, 9 packages)? Every downstream VERIFY command depends on the answer.
*Recommendation:* `@harness/*`, and rename the nine — PUBLIC_API is the only
document that names a scope at all, and the rename is mechanical.

**F.2 — The eight vocabulary contradictions in §A.3.** Specifically: does the
renderer union stay `react|preact|svelte|vanilla` (CONTRACTS §2, ADR-0001,
Appendix A.2, Stage 2's passing tests) or become `react|qwik|svelte|solid`
(PUBLIC_API)? And tiers: three named or five numeric?
*Recommendation:* **keep CONTRACTS on all eight.** They are unargued carry-over
from `files/adaptive-frontend-harness-prompt.md` — zero occurrences in any
frozen doc — and adopting them would void four ADRs to no demonstrated benefit.
The correct remedy is to **amend PUBLIC_API.md** (which is PROPOSED and invites
exactly this, L136–143) rather than CONTRACTS.md (which is frozen).

**F.3 — Budget/veto placement**, per §E.3.
*Recommendation:* split as described — threshold check in contracts, V001 in reward.

**F.4 — `packages/islands` and `packages/agent`.** PUBLIC_API omits the first
(which owns C005) and invents the second (which no stage builds).
*Recommendation:* add an `@harness/islands` row to PUBLIC_API; drop
`@harness/agent` until a stage owns it.

**F.5 — `packages/build` → `@harness/astro`.** CONTRACTS §9.2's esbuild
`build()` and PUBLIC_API's Astro-integration-plus-CLI are different products.
*Recommendation:* keep CONTRACTS §9.2 for Stage 4; treat the Astro integration
as post-Stage-8 work with its own contract section.

If F.2 is answered "keep CONTRACTS," then the only CONTRACTS amendment this
recovery needs is **§15's layout paragraph**, and the required ADR is narrow:
*"§15's flat `src/` tree is superseded by the pnpm workspace; all other §15
content stands."* That is the minimum-blast-radius outcome and the one I
recommend.

---

## Phase 1 VERIFY

| Check | Result |
|---|---|
| `docs/PUBLIC_API.md` exists and resolves `packages/*` vs `src/*` | **PASS** — L9–10, in favour of `packages/*` |
| CONTRACTS §15 ↔ PUBLIC_API agreement | **FAIL — 12 divergences, 8 blocking** (§A.3). Reported per Phase 1(a) as a Stage 0 defect. |
| Every `packages/flags/` file mapped to a destination | **PASS** — 11 of 11 (§C); 2 contested on destination, 0 unmapped |
| Zero remaining ORPHAN entries | **NOT YET** — 4 orphan identifiers (§C.1) pending F.2/F.3; no orphan *files* remain after the §C migration |
| Stage numbering mapped | **PASS** (§D) |
| Four Stage 2 items resolved | **PASS** (§E) — E.3 partially contested, ruling requested |

Phases 2 and 3 are **held** pending F.1–F.5.

---

# Phase 2 — DECIDE

Rulings received from human review (verbatim references below as F.1–F.5).
One remedy per divergence, as required.

| # | Divergence | Remedy | Why |
|---|---|---|---|
| F.1 | Npm scope: `@harness/*` vs `@ultimate-frontend/*` vs bare `flags` | **AMEND** (the 9 existing `package.json` name fields) | PUBLIC_API is the only document that names a scope at all. Confirmed by ruling. Mechanical rename, no code-shape change. |
| F.2.a | Renderer union: `react\|preact\|svelte\|vanilla` (CONTRACTS §2, ADR-0001) vs `react\|qwik\|svelte\|solid` (PUBLIC_API) | **AMEND PUBLIC_API**, keep CONTRACTS | Ruling: keep CONTRACTS authoritative on all 8 vocabulary items. PUBLIC_API's `qwik`/`solid` traced to `files/adaptive-frontend-harness-prompt.md` (pre-Stage-0), zero occurrences in any frozen doc. Amending CONTRACTS here would silently reverse ADR-0001, which explicitly rejected Solid. |
| F.2.b | Tiers: `critical\|standard\|deferred` (CONTRACTS §2, §8.2) vs numeric 0–4 (PUBLIC_API) | **AMEND PUBLIC_API**, keep CONTRACTS | Same reasoning; numeric tiers trace to the same pre-Stage-0 file and would void §8.2's budget table and ADR-0005. |
| F.2.c | RUM beacon (PUBLIC_API `./beacon`, injectable "RUM beacon endpoint") vs lab-only Playwright (CONTRACTS §11.2, ADR-0006) | **AMEND PUBLIC_API**, keep CONTRACTS | ADR-0006 explicitly rejected RUM/field collection. Also removing `lighthouse` peer (§ note below) — ADR-0006 rejects it by name too; same contamination source, caught during execution though not separately lettered in Phase 1. |
| F.2.d | Reward weights: frozen (REWARD.md §3, ADR-0007) vs injectable (PUBLIC_API) | **AMEND PUBLIC_API**, keep CONTRACTS | ADR-0007: "frozen to make experiments comparable over time... reweighting is a contract version bump." Consumer-tunable weights break KB cross-site comparability (§13.2 `reward_delta`). |
| F.2.e | Sample-size parameters: frozen `N_PER_ARM=91` derivation (§1.4, REWARD §6, ADR-0008) vs injectable (PUBLIC_API) | **AMEND PUBLIC_API**, keep CONTRACTS | ADR-0008 froze σ/α/power/δ as the "load-bearing guess," revisit-worthy only via ADR after real experiment data — not a per-consumer knob. `runExperiment`'s `n_per_arm?` test override (§12) stays internal/test-only, not elevated to public config. |
| F.2.f | Measure surface: `serve/collectSample/collectMany` (§11.3) vs `tier0/tier1/determinism` (PUBLIC_API) | **AMEND PUBLIC_API**, keep CONTRACTS | No frozen identifier by the proposed names exists; straightforward correction to the real frozen surface. |
| F.2.g | KB surface: `specificity/precedes/query/loadKB/saveKB/ingest` (§13.5) vs `query/write/merge/compat` (PUBLIC_API) | **AMEND PUBLIC_API**, keep CONTRACTS | Same — `write`/`merge`/`compat` are undefined anywhere; correction to the frozen five. |
| F.2.h | Contracts surface: `validate/resolve/makeBaselineProfile/applyProposal` (§5.4) vs `types, defineConfig, resolve, budget` (PUBLIC_API) | **AMEND PUBLIC_API**, keep CONTRACTS | `defineConfig` is undefined anywhere in frozen docs; three frozen functions were omitted. Corrected exports list below in Phase 3. |
| F.3 | Budget/veto placement: pure threshold (CONTRACTS §8.1) vs full V001 baseline-comparison (REWARD §5, owned by `src/reward/veto.ts` per REWARD §8) vs PUBLIC_API's single "budget" function in contracts | **SPLIT — MIGRATE half, build half fresh** | Threshold check (`checkBudget`) stays in `@harness/contracts` — it needs only `RouteBudgets`, no arm/baseline data. V001 proper (needs the baseline arm) is new work placed in `@harness/reward` per REWARD §8's frozen module surface. Neither document is contradicted; the split satisfies both. |
| F.4.a | `packages/islands` missing from PUBLIC_API, owns C005 | **AMEND PUBLIC_API** (add row) | PUBLIC_API is incomplete, not authoritative, here — deleting the directory per a literal VERIFY reading would delete C005's owner. Confirmed by ruling. |
| F.4.b | `packages/agent` in PUBLIC_API, no owning stage | **DISCARD** (remove the row) | No stage in STAGE_INPUTS.md produces it; an orphan-by-construction package. Confirmed by ruling. |
| F.5 | `packages/build`: CONTRACTS §9.2 `build()`/`BuildManifest` (esbuild) vs PUBLIC_API's Astro-integration-plus-CLI (`@harness/astro`) | **AMEND PUBLIC_API**, keep CONTRACTS | Confirmed by ruling: packages/build stays CONTRACTS §9.2 for Stage 4; Astro/CLI packaging is deferred, its row and exports map removed from this document version pending its own future contract section. |

**Bias-toward-MIGRATE check.** Of the 12 divergences from §A.3/§A.1, only F.3
required new code (V001's baseline half); everything else is either a
mechanical rename (F.1), a straight MIGRATE of Stage 2's files into their
CONTRACTS-specified package (§C), or an AMEND of the *proposed, non-frozen*
PUBLIC_API.md to conform to already-frozen CONTRACTS.md. Zero amendments to
CONTRACTS.md's normative content — the only CONTRACTS.md edit is §15's layout
paragraph itself, which PUBLIC_API's packages/* decision (accepted, §A.2)
requires and which the human ruling F.2 explicitly scoped the CONTRACTS
amendment to. This is the minimum-blast-radius outcome flagged as
recommended in Phase 1 §F.

**Endorsed deviation, per instruction:** Stage 2's `breaching_fields` array
return shape (rather than a single field) is kept as-is. Recorded in
`docs/decisions/02-reconciliation.md`, not re-litigated here.

**resolveRoute() / ResolvedIslandPlacement — DISCARD.** Phase 1 §C.1 flagged
these as orphan identifiers (no frozen basis) and §E.2 recommended deletion or
demotion; no F-item covered them explicitly, so this diagnosis closes it
directly under the "delete orphans" remedy Phase 3 authorizes. `PlacementTuple`
is **retained** — CONTRACTS §4 freezes the four-field concept it names (in
prose and an unnamed code block), so naming it is documentation, not
invention, unlike `resolveRoute`/`ResolvedIslandPlacement`, which have no
frozen counterpart at all.

**`validate()` — flagged, not built.** Per instruction, this reconciliation
does not implement CONTRACTS §5.4's `validate()`. It remains a known gap
(Phase 1 §E.2), recorded in the decision record so it is not lost before
whichever stage next touches `packages/contracts` needs it (§14 step 3 of
Stage 8 depends on it existing).

---

# Phase 3 — EXECUTE (completed)

Full record: `docs/decisions/02-reconciliation.md`. Summary of what moved:

- `docs/PUBLIC_API.md` revised: all 8 vocabulary items corrected to match
  CONTRACTS.md, `@harness/islands` row added, `@harness/agent` row dropped,
  `@harness/astro` replaced with `@harness/build` scoped to CONTRACTS §9.2.
- `docs/CONTRACTS.md` §15's layout paragraph amended (only content changed in
  CONTRACTS.md) — `docs/adr/0013-packages-workspace-supersedes-flat-src-layout.md`.
- `packages/flags/*` migrated into `packages/contracts/src/`:
  `schema.ts` → `types.ts` (renamed to match §15's own file name, not the
  reverse — CONTRACTS is not amended for code convenience), `constraints.ts`
  and `budget.ts` unchanged, `resolve.ts` narrowed (orphan `resolveRoute` /
  `ResolvedIslandPlacement` discarded, frozen `resolve()` kept), `VetoCode`
  added to `types.ts`. New `index.ts` barrel matches PUBLIC_API's exports map.
  Orphan directory `packages/flags/` deleted.
- `packages/reward/src/veto.ts` added: `checkV001BudgetBreach`, the
  baseline-comparison half of V001, composing on `checkBudget`.
- Nine `package.json` files renamed to `@harness/*` (`packages/reward` →
  `@harness/engine` specifically, per PUBLIC_API's reward+experiment merge
  note); `apps/site` left unrenamed (not a published package).
- `docs/OPEN_QUESTIONS.md` entries 4–8 all carry resolution or re-scope notes.

## Phase 1(c) — ORPHAN status, final

| Artifact | Original status | Final status |
|---|---|---|
| `schema.ts` → `types.ts` | migrate | **done** |
| `constraints.ts` | migrate | **done** |
| `resolve.ts` | migrate with corrections | **done** — narrowed |
| `budget.ts` | migrate | **done** |
| `PlacementTuple` | orphan name, frozen concept | **retained** — documented as internal |
| `resolveRoute()` | orphan | **discarded** |
| `ResolvedIslandPlacement` | orphan | **discarded** |
| `checkBudget()` / `MetricMeans` / `BudgetCheckResult` / `BudgetMetricKey` | orphan names, frozen concept (§8.1) | **retained** in `@harness/contracts` — these are the threshold-check half PUBLIC_API's own exports map now names (`checkBudget`) |
| V001 baseline comparison | missing | **built** — `@harness/reward`'s `checkV001BudgetBreach` |

**Zero ORPHAN entries remain.** Every artifact Stage 2 produced now has a
destination that exists and is documented in `docs/PUBLIC_API.md`, or was
discarded with its reason recorded above and in the decision record.

## Phase 3 VERIFY — results

| Check | Result |
|---|---|
| `pnpm install` (workspace re-link after 9 renames + new `@harness/contracts` workspace dependency) | **PASS** |
| `@harness/contracts` — `pnpm --filter @harness/contracts typecheck` | **PASS** |
| `@harness/contracts` — `pnpm --filter @harness/contracts test` | **PASS** — 22/22 (types, constraints, resolve, budget) |
| `@harness/contracts` — `pnpm --filter @harness/contracts build` | **PASS** |
| `@harness/engine` — `pnpm --filter @harness/engine typecheck` | **PASS** |
| `@harness/engine` — `pnpm --filter @harness/engine test` | **PASS** — 5/5 (veto) |
| `@harness/engine` — `pnpm --filter @harness/engine build` | **PASS** |
| No directory absent from PUBLIC_API's exports maps | **PASS** for every directory this reconciliation touched (`packages/contracts`, `packages/reward`) and every directory PUBLIC_API now documents (`islands`, `renderers`, `build`, `measure`, `kb`). **Known, tracked exception:** `apps/site` is claimed by no PUBLIC_API package — pre-existing (from the repo-skeleton stage, not Stage 2's divergence), explicitly out of this reconciliation's scope per F.5, not silently ignored. |
| Zero remaining ORPHAN entries (Phase 1(c)) | **PASS** — see table above |
| Sanity sweep: no leftover `@ultimate-frontend/*` references except `apps/site` | **PASS** |
| Sanity sweep: no `packages/flags/` or `packages/agent/` directories | **PASS** — both absent |

**Not verified (pre-existing, out of scope):** `packages/{islands,renderers,
build,measure,kb,experiment}` still have no test files — they are unchanged
Stage-1 stubs apart from their renamed `package.json`. Their `test` scripts
correctly report "No test files found" now exactly as before the rename; this
reconciliation did not touch their content and building it out is each
package's own future stage's job.
