# OPEN_QUESTIONS

Questions appended by stage executors per the Universal Preamble. Each entry
notes the conservative reading that was implemented so work could continue.

## 2026-07-26 — Design stage (contract layer)

1. **The architecture spec was described as "attached" but no spec file exists
   anywhere in the (otherwise empty) repository.** Conservative reading
   implemented: the design-stage prompt's own enumeration (the eight named
   types, the four-dimension constraint table, island capability contracts,
   budgets, KB precedence, reward/veto/tier/sample-size requirements, eight
   downstream stages) was treated as the complete spec, and every ambiguity it
   left was resolved and recorded in `docs/adr/0001`–`0012`. If a real spec
   exists, it must be diffed against `docs/CONTRACTS.md` before Stage 1 runs —
   afterward the contract is frozen.

2. **The Universal Preamble requires a colocated test for every created file
   and a passing VERIFY, but this stage's prompt forbids implementation code
   and supplies no VERIFY command.** Conservative reading implemented: the
   documentation files carry embedded normative test vectors instead
   (CONTRACTS §4.2 checksum, Appendix B, REWARD Appendix), the prompt-mandated
   self-audit was performed in place of VERIFY, and the colocated-test rule is
   applied to downstream stages via `docs/STAGE_INPUTS.md`.

3. **No stage 1–8 owns the outer autonomous loop** (baseline scan → `propose`
   → `runExperiment` → `ingest` → repeat). All building blocks are contracted;
   the loop itself is not. Conservative reading implemented: stages 1–8 were
   left exactly as scoped; the loop is assumed to be a later stage or a manual
   driver. Needs an explicit decision before the system can run unattended.

## 2026-07-26 — "Configuration layer" stage (packages/flags/)

4. **`packages/flags/` matches neither the frozen repo layout in
   `docs/CONTRACTS.md` §15 (`src/contracts/{types,constraints,validate,
   resolve}.ts`) nor the package set the repo-skeleton stage actually created
   (`packages/{contracts,islands,renderers,build,measure,reward,experiment,
   kb}` — no `packages/flags` among them).** Per the Universal Preamble,
   `docs/CONTRACTS.md` is a frozen input and wins on contradiction, but this
   stage's OUTPUTS explicitly enumerate `packages/flags/{schema,constraints,
   resolve,budget}.ts` by exact path. Conservative reading implemented: built
   exactly the files this stage's OUTPUTS named, at the literal paths named,
   treating `packages/flags` as an intentionally distinct config-layer package
   for this stage rather than reusing/renaming the existing (empty)
   `packages/contracts`. Did not touch `packages/contracts` or any
   `src/contracts/*` path. A human should decide whether `packages/flags` is
   the real intended home for this logic or whether it should be merged into
   `packages/contracts` before more stages build on top of it.

   **RESOLVED (Stage 2.5 reconciliation, 2026-07-26).** `packages/flags/`
   migrated into `packages/contracts/src/` and the orphan directory deleted.
   `docs/PUBLIC_API.md` is now the settled ground truth for package layout;
   `docs/CONTRACTS.md` §15 was amended (the layout paragraph only) by
   ADR-0013 to point at `packages/*/src/` instead of flat `src/`. See
   `docs/decisions/02-reconciliation.md`.

5. **`resolve.ts`'s requested signature — "given SiteConfig + route path,
   returns the resolved renderer/hydration/build profile for each island" —
   does not match CONTRACTS.md §5.4's frozen `resolve(config: SiteConfig):
   ResolvedSiteConfig`, and CONTRACTS.md has no type named anything like
   "per-island build profile."** Conservative reading implemented:
   `resolve.ts` exports the frozen `resolve()` (site-wide, verbatim signature)
   as the base operation, plus an additional `resolveRoute(config, path)`
   built strictly from `resolve()` and CONTRACTS §4's own "placement tuple"
   concept `(renderer, hydration, render_mode, data_strategy)` — the closest
   defensible reading of "renderer/hydration/build profile" without inventing
   new frozen-doc terminology. `makeBaselineProfile`/`applyProposal` (also
   part of CONTRACTS §5.4's Stage-1 `resolve.ts` surface, requiring the
   `BuildProfile`/`Proposal` types) were NOT implemented — this stage's
   OUTPUTS never mention proposals or build profiles as artifacts, and those
   types were judged out of scope for a "configuration layer" package. Flag
   for a human: if `packages/flags` is meant to fully satisfy CONTRACTS §5.4's
   Stage-1 obligations, this is a gap.

   **RESOLVED (Stage 2.5 reconciliation, 2026-07-26).** `resolveRoute()` and
   `ResolvedIslandPlacement` had no frozen basis anywhere in CONTRACTS.md and
   were discarded during migration, not carried into
   `packages/contracts/src/resolve.ts` — only the frozen `resolve(config):
   ResolvedSiteConfig` survived. `PlacementTuple` was retained (it names a
   concept CONTRACTS §4 does freeze, in prose and an unnamed code block).
   **Re-scoped, not resolved:** `makeBaselineProfile`/`applyProposal` and
   `validate()` remain unbuilt in `packages/contracts` — flagged again,
   explicitly, in `docs/decisions/02-reconciliation.md` so they are not lost
   before Stage 8 needs `validate()` (§14 step 3).

6. **`budget.ts`'s "budget evaluation, returns pass/fail plus the breaching
   field" is under-specified by this stage's INPUTS.** CONTRACTS.md §8.1
   defines `RouteBudgets` as a per-metric maximum-acceptable-mean, but the
   actual veto rule that *uses* budgets (V001, `BUDGET_BREACH`, which also
   compares against the baseline arm's mean) lives in `docs/REWARD.md`, which
   is not in this stage's INPUTS list. Conservative reading implemented:
   `checkBudget()` compares a supplied means object directly against a
   `RouteBudgets` and reports pass/fail — it does NOT implement the
   baseline-comparison half of V001, since that requires REWARD.md content
   this stage was not permitted to read. Also: the prompt says "the breaching
   field" (singular); since a single metrics object can breach multiple
   budgets simultaneously, silently reporting only one would hide real
   breaches, so `breaching_fields` is returned as an array (canonical metric
   order) rather than a single field.

   **RESOLVED (Stage 2.5 reconciliation, 2026-07-26).** REWARD.md is now
   available. The split is: `checkBudget()` (pure threshold check) stays in
   `packages/contracts/src/budget.ts` unchanged; V001's baseline-comparison
   conjunct is now implemented in `packages/reward/src/veto.ts`
   (`checkV001BudgetBreach`), composing on top of `checkBudget`. The
   array-of-breaching-fields return shape is explicitly endorsed and kept —
   see `docs/decisions/02-reconciliation.md`. **Re-scoped, not fully
   resolved:** only V001 is implemented; V002–V005 need `MeasurementSample`/
   `SampleFlags` data not yet defined in this package and remain full Stage 6
   work per REWARD.md §8's complete `evaluateVetoes` surface.

7. **The mandated test "a config with an unknown enum value is rejected, not
   coerced" doesn't name which function is "the validator."** No separate
   `validate.ts` exists among this stage's OUTPUTS. Conservative reading
   implemented: `constraints.ts`'s `checkConstraints(input: unknown)` performs
   runtime enum-membership checks on all four placement-tuple fields before
   evaluating C001–C004, and throws `TypeError` (rather than silently passing
   or defaulting) on any unrecognized value. "The constraint table" in the
   TEST REQUIREMENTS was read as CONTRACTS §4.1's four-row deny list (C001–
   C004) only, not §4.3's contract-dependent C005 — C005 requires
   `IslandContract` data (event declarations) that isn't reachable from this
   stage's INPUTS (`docs/CONTRACTS.md`, `packages/flags/`) and is explicitly
   Stage 2's job per CONTRACTS §5.4 (`validateWithContracts`).

   **RESOLVED (Stage 2.5 reconciliation, 2026-07-26).** Confirmed correct on
   the merits, mis-attributed only in numbering: C005 is owned by
   `packages/islands` (STAGE_INPUTS.md's Stage 2, distinct from the prompt
   labelled "Stage 2" that produced `packages/flags/`), which was missing
   from `docs/PUBLIC_API.md`'s original draft and has now been added there.
   See `docs/RECONCILIATION.md` §D and §E.4.

8. **Scaffolding files not in the literal OUTPUTS list were added out of
   necessity**: `packages/flags/package.json` and `packages/flags/tsconfig.json`.
   Without them the package does not exist in the pnpm workspace and
   `pnpm --filter flags typecheck && pnpm --filter flags test` (the VERIFY
   command) has nothing to run. These mirror the shape already used by
   sibling packages from the repo-skeleton stage.

   **SUPERSEDED (Stage 2.5 reconciliation, 2026-07-26).** `packages/flags/`
   no longer exists; its content lives in `packages/contracts/`, whose own
   `package.json`/`tsconfig.json`/`tsconfig.build.json` are the current
   scaffolding. No action needed beyond the migration itself.

## 2026-07-26 — Stage 2.5 recovery: tracked gap not resolved by this reconciliation

9. **`apps/site` (the Astro scaffold from the repo-skeleton stage) is
   claimed by no package in `docs/PUBLIC_API.md`.** `docs/PUBLIC_API.md`'s
   F.5 ruling scoped `packages/build` to CONTRACTS §9.2's esbuild pipeline
   only, and explicitly deferred Astro/CLI packaging (the earlier draft's
   `@harness/astro` row) rather than silently dropping it — see
   `docs/PUBLIC_API.md`'s note on `packages/build/` and
   `docs/decisions/02-reconciliation.md`'s F.5 cost note. No stage in
   `docs/STAGE_INPUTS.md` builds it either (`prompts/STAGE_MAP.md` records
   it as "no STAGE_INPUTS.md equivalent — deferred," old-plan stage 7).
   Conservative reading: `apps/site` is left exactly as the repo-skeleton
   stage built it (a bare Astro project with one placeholder page),
   untouched by Stages 1–8. **This must resurface, not be rediscovered from
   scratch, when Astro/CLI work actually starts:** at that point, someone
   needs to (a) decide whether `apps/site` becomes the real consumer-facing
   integration point or is discarded in favor of a fresh package, and
   (b) write the CONTRACTS.md section that stage would need —
   `packages/build`'s own §9.2 scope does not cover an Astro integration, a
   Vite plugin, or a CLI, and none of those have a frozen module surface
   anywhere yet.

10. **Four old-plan stages have no `docs/STAGE_INPUTS.md` counterpart at
    all and were correctly not generated in `prompts/`, per Stage 2.6's
    explicit "do not invent a stage `docs/STAGE_INPUTS.md` does not define"
    rule.** Recorded here so the gap is tracked rather than silently
    dropped, per direct instruction after Stage 2.6's approval:
    - **Astro integration + CLI** (old-plan stage 7) — see entry 9 above;
      `packages/build` covers only CONTRACTS §9.2's esbuild pipeline.
    - **Agent runtime templates** (old-plan stage 8, `@harness/agent`) —
      `docs/PUBLIC_API.md`'s F.4 ruling dropped the `@harness/agent` row
      entirely (no owning stage, orphan-by-construction); the templates
      themselves (`SYSTEM.md`, `PROPOSAL.schema.json`, playbooks) have no
      CONTRACTS.md basis of any kind.
    - **Fixtures / integration / DoD** (old-plan stage 9) — Stage 1
      (`prompts/stage-01.md`) already folds reference-fixture
      materialization in, but a consumer-facing integration pass and a
      Definition-of-Done checklist have no contracted stage.
    - **Explainer** (old-plan stage 10, new in the revised plan) — no
      CONTRACTS.md or STAGE_INPUTS.md basis; not generated.

    None of these can be added by inventing a stage prompt — each needs a
    `docs/CONTRACTS.md` section (or a companion frozen doc) defining its
    module surface and a `docs/STAGE_INPUTS.md` row granting it a number and
    a read scope, before Stage 2.6-style prompt generation could produce it
    correctly. That is future design work, not something this recovery or
    Stage 2.6 is positioned to do.

## 2026-07-26 — Stage 3 (renderer adapters, scheduler, reference components)

11. **CONTRACTS.md §7.3's `IslandBootSpec` has no field for the actual JS
    module the scheduler must pass to `adapter.hydrate`/`mount`.** This is a
    genuine gap in the frozen spec, not a contradiction — the interface as
    written (`island_id, contract_id, renderer, hydration, mode, props,
    needs_data`) gives the scheduler everything needed to decide *when* and
    *how* to boot an island, but nothing to resolve *which compiled module*.
    Conservative reading implemented: `packages/renderers/src/scheduler.ts`
    defines `BootSpecWithModule extends IslandBootSpec { module: IslandModule
    }` — purely additive, no frozen field renamed or removed — and
    `initHarness` takes `BootSpecWithModule[]`. The assumption is that
    whichever caller constructs these specs (a per-route bundle, built by
    Stage 4) already holds a direct reference to each module it needs, since
    it built the bundle around a known, fixed set of islands. Flag for
    Stage 4: confirm this assumption holds when it designs how boot specs are
    actually constructed and serialized into the generated bundle.

12. **CONTRACTS §6.2 says a11y attributes ("role", accessible name) must be
    carried by "the rendered island wrapper", but §7.5's wrapper
    (`<div data-island=... >`) is templated by Stage 4's build process from a
    fixed shell, with no role/aria-label slot — and neither `IslandBootSpec`
    (§7.3) nor the wrapper template itself carry the island's `a11y` spec for
    Stage 4 or the scheduler to place there.** Conservative reading
    implemented: each reference component's own root element (the thing the
    component renders, which becomes the wrapper's sole child) carries
    `role`/`aria-label`/focusability directly — e.g. `nav-menu`'s `<nav
    role="navigation" aria-label="Main navigation">`. This works identically
    whether the content came from a server-rendered HTML string or a
    client-side hydrate/mount, unlike putting attributes on the true outer
    wrapper (which a plain HTML string returned by `renderToString` cannot
    reach). **Flag for Stage 5**, which actually measures §6.2 compliance:
    look for role/aria-label on the data-island wrapper's first element
    child, not the wrapper itself, unless a future CONTRACTS.md revision
    specifies otherwise. Events, by contrast, genuinely are dispatched on the
    true outer wrapper (`container.closest("[data-island]")`, see
    `packages/renderers/src/components/emit-event.ts`), since `hydrate`/
    `mount` receive a real DOM reference to it — no gap there.

## 2026-07-26 — Stage 4 (build pipeline)

13. **CONTRACTS §7.5's fixed shell template has no slot for the route's
    resolved data value to reach the client bundle, for `data_strategy`
    `"static"`/`"request"`** — only `"client"` fetches (`DATA_PATH_PREFIX`),
    so a `"static"`/`"request"` island needing `data` on the client (legal
    per the constraint table whenever `hydration ≠ "none"`) has no
    documented way to receive it. Genuine gap, not a contradiction: §7.5's
    shell elements (`meta charset`, `meta viewport`, `title`, `main`, the
    module script) are all still present exactly as specified; nothing is
    removed or altered. Conservative reading implemented:
    `packages/build/src/build.ts` adds one inline
    `<script>window.__ROUTE_DATA__=...</script>` tag, populated with the
    resolved data, immediately before the module script tag, for routes
    whose `data_strategy` is `"static"` or `"request"`. The generated client
    bundle's bootstrap code reads `window.__ROUTE_DATA__` as `data_inline`
    for `initHarness`. Flag for Stage 5 (serving/measurement): the server
    for `"request"`-strategy routes must populate this same script tag with
    the actual per-request data value (not the build-time placeholder), or
    the client-side data will be stale/wrong on every request after the
    first.

    **RESOLVED (Stage 5, 2026-07-26).** `packages/measure/src/serve.ts`
    reads the route's data file fresh on every request when
    `data_strategy = "request"` (no caching) and passes it straight to
    `server/<route_id>.mjs`'s `render(data)`, which — per Stage 4's
    `generateServerEntry` — already embeds whatever `data` it's called with
    into the same `window.__ROUTE_DATA__` tag for `"request"`-strategy
    routes. Verified end-to-end by `packages/measure/src/serve.test.ts`'s
    catalog (`data_strategy = "request"`) test, which asserts the real
    per-request row data appears in the served HTML.

## 2026-07-27 — Stage 6 (reward engine)

14. **V005 `METRIC_COLLAPSE`'s threshold is sensitive to binary
    floating-point representation at its exact boundary.** REWARD.md §5
    specifies the predicate as `norm_m(mean_v(m)) − norm_m(mean_b(m)) <
    −0.15` — a strict inequality on a value computed from division. A
    collapse that is *algebraically* exactly −0.15 can land on either side of
    the threshold depending on which metric and which raw values produced it.
    Worked example, pinned as a test in
    `packages/reward/src/veto.test.ts`: `tbt_ms` baseline 300 → score 0.75
    (exact in binary), variant 360 → score 0.6, whose nearest double is
    0.59999999999999997780; the difference is −0.15000000000000002220, which
    is strictly less than the nearest double to −0.15
    (−0.14999999999999999445), so V005 **fires** despite the algebra saying
    "exactly at the threshold, should not fire". A different metric whose
    arithmetic rounds the other way would not fire on an equally-exact
    −0.15.
    Conservative reading implemented: the predicate is kept **literal** — no
    epsilon tolerance, no rounding before comparison. Adding either would be
    inventing a tolerance REWARD.md does not specify, and would silently
    change which experiments get vetoed (in the permissive direction, which
    is the wrong way to err for a safety gate). The behavior is pinned by a
    test with an explanatory comment so it reads as deliberate rather than
    accidental. **Needs a human ruling** if exact-boundary determinism across
    metrics ever matters: the fix would be to specify the comparison at a
    stated precision (e.g. compare `roundHalfUp(delta, 4) < -0.15`), which is
    a REWARD.md amendment, not an implementation choice.

15. **`MetricValues`, `SampleFlags`, and `MeasurementSample` are now declared
    in two places.** Stage 5 defined them locally in
    `packages/measure/src/collect.ts` (they were absent from
    `packages/contracts/src/types.ts` at the time); Stage 6 needed the same
    types and added them to `types.ts`, per CONTRACTS §15's mandate that
    `types.ts` contain "verbatim, every type/interface declaration in this
    document". The two declarations are structurally identical, so
    TypeScript's structural typing means Stage 7 can pass
    `@harness/measure`'s `collectMany()` output straight into
    `@harness/engine`'s `decide()` without friction — verified by both
    packages typechecking against each other.
    Conservative reading implemented: the duplicate was left in place rather
    than refactored, because `packages/measure/**` is outside Stage 6's write
    scope and `docs/RULES.md` forbids refactoring outside OUTPUTS. **The
    cleanup is one edit** — change `collect.ts`'s three local `export
    interface` declarations to re-exports from `@harness/contracts` — and
    should be folded into whichever future stage next has `packages/measure`
    in its write scope. Until then the risk is that the two drift: an edit to
    one would not produce a type error in the other, it would just silently
    stop matching.

    **RESOLVED (human ruling, 2026-07-27).** `packages/measure/src/collect.ts`
    now imports `MetricValues`, `SampleFlags`, and `MeasurementSample` as
    types from `@harness/contracts` alongside its existing
    `ResolvedRouteConfig`/`IslandContract`/`Arm` import; the three local
    `export interface` declarations were deleted. No other package imported
    these three names from `@harness/measure` specifically (confirmed by
    grep across `packages/*/src/**/*.ts`), so this was a same-file fix with
    no consumer-side changes needed.

## 2026-07-27 — Stage 7 (experiment runner)

16. **`docs/PUBLIC_API.md`'s `@harness/engine` re-export of `experiment`
    cannot be implemented as written — it would create a circular workspace
    dependency.** PUBLIC_API's exports map says `@harness/engine`'s `"."` is
    "(re-exports reward + experiment)", and its reward+experiment merge note
    describes "a thin re-export at `packages/reward/src/index.ts` that also
    re-exports `packages/experiment`". But the dependency runs the other way:
    `packages/experiment/src/run.ts` imports `decide` from
    `@harness/engine`, because REWARD.md §8 freezes `decide` at
    `src/reward/decide.ts` (Stage 6's package). Adding the re-export would
    make `@harness/engine` depend on `@harness/experiment`, which already
    depends on `@harness/engine`.
    Conservative reading implemented: the re-export was **not** added —
    `prompts/stage-07.md` explicitly scoped it out of this stage anyway
    ("not your job to wire"), and now there is a concrete reason it cannot be
    done as specified rather than merely deferred. `packages/reward/src/index.ts`
    still exports only reward content; `packages/experiment` is currently
    reachable only by direct workspace import. **Needs a human ruling.** The
    three viable shapes: (a) make `@harness/engine` a third, dependency-free
    facade package that re-exports both `packages/reward` and
    `packages/experiment`, leaving those two independent; (b) publish reward
    and experiment under separate npm names and drop the merge; or (c) move
    `decide` into `packages/experiment`, which contradicts REWARD.md §8's
    frozen module path and is therefore the worst of the three. Until this is
    settled, nothing consumes `@harness/engine` expecting `runExperiment` to
    be on it.

    **RESOLVED (human ruling, 2026-07-27).** Option (b): `@harness/engine`
    (`packages/reward`) and `@harness/experiment` (`packages/experiment`)
    ship as two separate public packages, no re-export either direction.
    `docs/PUBLIC_API.md`'s Package table, exports map, and reward+experiment
    note were corrected accordingly; `packages/reward/src/index.ts` and
    `packages/experiment/src/index.ts` no longer claim or imply a merge. See
    `docs/decisions/07-experiment.md`.
