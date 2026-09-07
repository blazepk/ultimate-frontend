# Staged Build Plan — Publishable Harness Package

Building the harness as a **distributable package** rather than in-repo infrastructure changes three things structurally:

1. **The harness cannot know the consumer's islands.** Stage 3 no longer implements components — it builds *renderer adapters*, the plumbing that resolves a consumer's island contract to a framework. Islands become fixtures, not product.
2. **The public API is now a promise.** Stage 0 must freeze the exported surface, not just internal types, because breaking it breaks strangers' builds.
3. **Two new stages appear**: the Astro integration + CLI that consumers actually touch, and fixture-consumer integration tests that catch API breakage the unit tests can't see.

Governing principle is unchanged: **the expensive model freezes contracts, cheap models fill in against them.** Run each stage in a fresh session.

---

## EXECUTION ORDER

| # | Stage | Model | Depends on | Parallel? |
|---|---|---|---|---|
| 0 | Contract + public API freeze | **Fable 5** | — | no |
| 1 | Monorepo & package tooling | **Haiku 4.5** | 0 | no |
| 2 | `@harness/flags` | **Sonnet 5** | 0, 1 | no |
| 3 | `@harness/renderers` adapters | **Sonnet 5** | 0, 1, 2 | **yes** — one run per adapter |
| 4 | `@harness/measure` | **Sonnet 5** | 0, 1 | yes |
| 5 | `@harness/kb` | **Sonnet 5** | 0, 1 | yes |
| 6 | `@harness/engine` | **Opus 5** | 0, 2, 5 | no |
| 7 | `@harness/astro` + CLI | **Sonnet 5** | 2, 3, 4, 6 | no |
| 8 | `@harness/agent` templates | **Opus 5** | 0, 6 | no |
| 9 | Fixtures, integration, publish, DoD | **Sonnet 5** | all | no |

**Runtime, after build:** proposer = Sonnet 5 · mechanical steps = Haiku 4.5.

Stage 5 moves from Haiku to Sonnet in the package model — the two-layer merge and version-skew exclusion are real logic, and getting them subtly wrong produces plausible-looking but incomparable evidence.

---

## UNIVERSAL PREAMBLE

Prepend verbatim to every stage from 1 onward.

```
You are executing ONE stage of a larger build. Scope discipline is the primary requirement.

CONTEXT RULES
- Read only the files listed under INPUTS. Do not explore beyond them.
- docs/CONTRACTS.md and docs/PUBLIC_API.md are FROZEN. Never modify them, never work
  around them.
- If an input contradicts this prompt, the input wins. Report the contradiction.

PACKAGE RULES
- This code ships to consumers you will never meet. Anything not listed in the package's
  exports map is internal.
- Never import across package boundaries except through a published entry point.
- Never add a runtime dependency on a UI framework. Frameworks are optional peers.
- Every error message a consumer can see must name the offending config field and state
  the fix. Stack traces are not error handling.

SCOPE RULES
- Produce exactly the files under OUTPUTS. No extras.
- Make no design decisions. If ambiguous, append to docs/OPEN_QUESTIONS.md, implement the
  most conservative reading, continue.
- Do not refactor, rename, or reformat outside OUTPUTS. Do not add undeclared dependencies.

COMPLETION RULES
- Every file gets a colocated test.
- Run VERIFY. Do not report success until it passes.
- If VERIFY cannot pass, emit: BLOCKED: <one-line reason>. Never weaken a test to pass.
- Final output: files created, VERIFY result, OPEN_QUESTIONS entries added. Nothing else.
```

---

## STAGE 0 — Contract & Public API Freeze · **Fable 5**

> Design only, no implementation. The one stage where judgment is permitted.

```
You are designing the contract and public API surface for a distributable frontend
harness package. The architecture spec is attached. Read it completely first.

This ships to consumers as a set of npm packages. Every downstream stage is executed by a
cheaper model with no access to this conversation. Design accordingly.

Produce ONLY these artifacts. No implementation code.

1. docs/CONTRACTS.md — the frozen internal interface surface:
   - Complete TypeScript types: SiteConfig, RouteConfig, IslandConfig, BuildProfile,
     IslandContract, RendererAdapter, Proposal, KBRecord, ExperimentResult,
     MeasurementSample, HarnessConfig.
   - Full constraint table: every illegal dimension combination with a stable error code.
   - KB precedence rules as an unambiguous ordering function, including the
     consumer-over-package rule and the version-incompatibility exclusion rule.
   - Version-stamping requirements: which artifacts carry harness_version, and the
     compatibility predicate that decides whether a stamped record is scoreable.

2. docs/PUBLIC_API.md — the distribution contract:
   - Exports map for each of the seven packages. Everything else is internal.
   - Which config surfaces are consumer-injectable (budgets, reward weights, sample-size
     parameters, renderer allowlist) and which are fixed (flag dimensions, constraint
     table, tier definitions). Justify the boundary.
   - Peer dependency matrix: which renderers are optional peers, and the detection
     mechanism for what a consumer has installed.
   - Semver policy: state explicitly which changes are major. Reward normalization
     changes, constraint additions, and KB precedence changes are major.
   - The RendererAdapter interface — the single most important type in the package,
     since it determines whether adding a framework later is additive or breaking.

3. docs/REWARD.md — metric normalization with explicit thresholds, veto list, tier
   definitions with latency budgets, minimum sample size formula with assumed baseline
   variance, and which parts consumers may override.

4. docs/STAGE_INPUTS.md — for each downstream stage 1-9, the exact files that stage may
   read.

REQUIREMENTS
- Every type complete enough to implement against with zero further design input.
- Every enum closed. No `string` where a union belongs. No optional field without a
  documented default.
- Design RendererAdapter so a new framework can be added without touching flags, engine,
  or kb. If adding a renderer requires changes outside packages/renderers, redesign it.
- Prefer fewer dimensions. Justify each in an ADR; unjustifiable ones get removed.
- Resolve all ambiguity here. Downstream models cannot.

5. docs/adr/ — one ADR per load-bearing decision: decision, alternatives rejected, and
   the condition under which to revisit.

Before finishing, audit: for each downstream stage, could a model with only its
STAGE_INPUTS files implement it without inventing anything? Fix every gap.
```

---

## STAGE 1 — Monorepo & Package Tooling · **Haiku 4.5**

```
[UNIVERSAL PREAMBLE]

INPUTS: docs/PUBLIC_API.md (package names and exports maps only), docs/STAGE_INPUTS.md

TASK: Create the monorepo skeleton and publishing tooling. Structure only, no logic.

OUTPUTS:
- pnpm-workspace.yaml covering packages/* and fixtures/*
- One package.json per package from PUBLIC_API.md, each with:
    name, version 0.0.0, type module, exports map exactly as specified,
    files allowlist, publishConfig access public, peerDependencies with
    peerDependenciesMeta marking renderer peers optional
- Root tsconfig.json (strict) plus per-package tsconfig with project references
- tsup or equivalent build config per package: ESM output, declaration files, sourcemaps
- Changesets configured for versioning
- .github/workflows/ci.yml: typecheck, test, build, publint on every package
- .gitignore, .npmrc

DEPENDENCIES PERMITTED: typescript, tsup, vitest, @changesets/cli, publint. Nothing else.

DO NOT: implement any type, write business logic, add framework dependencies, or create
any file under a package's src/ beyond an empty index.ts.

VERIFY: pnpm install && pnpm typecheck && pnpm build && pnpm publint
```

---

## STAGE 2 — `@harness/flags` · **Sonnet 5**

```
[UNIVERSAL PREAMBLE]

INPUTS: docs/CONTRACTS.md, docs/PUBLIC_API.md, packages/flags/

TASK: Implement the configuration layer. It is generic — it knows nothing about any
specific site. All site-specific values arrive as arguments.

OUTPUTS:
- src/schema.ts       types transcribed verbatim from CONTRACTS.md
- src/constraints.ts  validator returning the exact error codes from the constraint table
- src/resolve.ts      given SiteConfig + HarnessConfig + route path, returns resolved
                      renderer/hydration/build profile per island
- src/budget.ts       budget evaluation against consumer-supplied budgets; returns
                      pass/fail plus the breaching field and its measured value
- src/defineConfig.ts typed helper consumers call in harness.config.ts
- src/index.ts        exports exactly what PUBLIC_API.md lists, nothing more
- Colocated tests

REQUIREMENTS
- Budgets, reward weights, and renderer allowlist are parameters, never constants.
- A config naming a renderer absent from the allowlist fails with an actionable message
  naming the renderer and the allowlist. Never a module resolution error.
- Validation errors are structured objects with a code, not thrown strings.

TEST REQUIREMENTS
- One test per constraint table row, asserting the exact error code.
- Unknown enum values are rejected, never coerced.
- Property test: any config passing the validator resolves without throwing.
- A test importing only from the package root, asserting nothing internal is reachable.

VERIFY: pnpm --filter @harness/flags typecheck && test && build && publint
```

---

## STAGE 3 — Renderer Adapters · **Sonnet 5** *(parallel: one run per adapter)*

> Run once per renderer, each in its own session. This is the highest-volume, lowest-cost
> stage in the plan; keeping context to one adapter is what makes that true.

```
[UNIVERSAL PREAMBLE]

INPUTS: docs/CONTRACTS.md (RendererAdapter + IslandContract sections only),
        packages/renderers/src/types.ts

TASK: Implement the RendererAdapter for <RENDERER> only.

You are NOT implementing any component. You are implementing the adapter that lets a
consumer's island contract be rendered by <RENDERER>. The harness never sees a real
island at build time — consumers supply those.

OUTPUTS:
- packages/renderers/src/<RENDERER>/adapter.ts
- packages/renderers/src/<RENDERER>/index.ts
- packages/renderers/src/<RENDERER>/adapter.test.ts
- fixtures/multi-renderer/islands/counter/impl.<RENDERER>.<ext>   (test fixture only)

The adapter must implement every RendererAdapter member: framework detection, hydration
directive mapping, prop serialization, event binding, bundle attribution reporting, and
the declared capability set.

REQUIREMENTS
- <RENDERER> is an OPTIONAL peer dependency. Importing this adapter when the framework is
  not installed must produce a clear message naming the missing package and the install
  command — never a resolution failure.
- Declare capabilities honestly. If <RENDERER> cannot support a hydration mode, the
  adapter reports that and the constraint layer enforces it. Never silently degrade.
- The fixture island exists to prove adapter parity. Keep it minimal: one piece of state,
  one event, one accessibility requirement.

DO NOT: modify types.ts, touch any other adapter, add state management libraries,
introduce global side effects, or make this adapter's presence required by any other
package.

VERIFY: pnpm --filter @harness/renderers test -- <RENDERER> && pnpm build
```

---

## STAGE 4 — `@harness/measure` · **Sonnet 5**

```
[UNIVERSAL PREAMBLE]

INPUTS: docs/CONTRACTS.md, docs/REWARD.md, docs/PUBLIC_API.md, packages/measure/

TASK: Implement tiered measurement collection.

OUTPUTS:
- src/tier0.ts        parse build output: bundle bytes, module count, per-island
                      attribution; emit MeasurementSample
- src/tier1.ts        Playwright + Lighthouse under pinned throttling
- src/determinism.ts  N repeated runs, median-of-medians, variance reporting; any sample
                      exceeding the REWARD.md coefficient-of-variation threshold is
                      marked ADVISORY_ONLY
- src/beacon.ts       client RUM beacon emitting CWV to a consumer-configured endpoint;
                      must add under 1KB to the consumer's bundle
- src/index.ts        exports per PUBLIC_API.md
- Tests using fixtures; no live network in tests

DETERMINISM REQUIREMENTS (non-negotiable)
- CPU throttle multiplier and network profile are explicit config, never defaults.
- Every sample records runner fingerprint: CPU model, core count, memory.
- Samples with differing fingerprints must never be compared. The collector enforces this.
- Every emitted sample carries harness_version.

PACKAGE REQUIREMENTS
- Playwright and Lighthouse are optional peers. Tier 1 unavailable without them must
  degrade to a clear "tier 1 unavailable, install X" state, not a crash.
- The beacon ships as a separate entry point so consumers not using RUM pay zero bytes.

DO NOT: implement reward scoring, promotion logic, or anything from the engine.

VERIFY: pnpm --filter @harness/measure typecheck && test && build && publint
```

---

## STAGE 5 — `@harness/kb` · **Sonnet 5**

```
[UNIVERSAL PREAMBLE]

INPUTS: docs/CONTRACTS.md (KBRecord, precedence rules, version-stamping sections)

TASK: Implement the two-layer knowledge base.

OUTPUTS:
- src/schema.ts       KBRecord type transcribed from CONTRACTS.md
- src/merge.ts        merge package seed layer with consumer layer, applying precedence
- src/query.ts        query by route pattern + config delta, returning records in strict
                      precedence order
- src/write.ts        append to the CONSUMER layer only; reject malformed input
- src/compat.ts       version-compatibility predicate; excludes records written under an
                      incompatible reward schema
- seed/*.json         package-shipped external records: hydration cost models, island
                      granularity, streaming SSR, per-framework bundle baselines. Each
                      evidence_type "external", confidence <= 0.5, with a source URL.
- Tests

CRITICAL REQUIREMENTS
- The seed layer is READ-ONLY. write.ts must be structurally incapable of modifying it.
- Consumer records outrank package records unconditionally.
- Version-incompatible records are EXCLUDED from scoring, not down-weighted. Excluded
  records must remain queryable for audit, clearly marked.
- Upgrading the package must never touch consumer records. Test this explicitly.

TEST REQUIREMENTS
- One test per precedence rule, using hand-built fixtures.
- Records with superseded_by set are never returned as active.
- A record missing a required field is rejected on write.
- A consumer record and a seed record making contradictory claims: consumer wins.
- A record stamped with an incompatible version is excluded from scoring but visible in
  audit output.

VERIFY: pnpm --filter @harness/kb typecheck && test && build && publint
```

---

## STAGE 6 — `@harness/engine` · **Opus 5**

```
[UNIVERSAL PREAMBLE]

INPUTS: docs/CONTRACTS.md, docs/REWARD.md, packages/flags/, packages/kb/, packages/measure/

TASK: Implement proposal validation, experiment lifecycle, and promotion logic.

OUTPUTS:
- src/reward/score.ts        composite reward per REWARD.md; vetoes short-circuit before
                             any weighting is applied
- src/reward/power.ts        minimum sample size given baseline variance and target effect
- src/reward/correlation.ts  rolling lab-to-field correlation; emits a trustworthy /
                             untrustworthy verdict on the proxy signal
- src/decide/validate.ts     proposal schema + constraint + cooldown + blast-radius checks
- src/decide/lifecycle.ts    propose → deploy → measure → resolve; writes a KB record on
                             EVERY resolution including inconclusive
- src/decide/rollback.ts     trigger evaluation and revert emission
- src/index.ts               exports per PUBLIC_API.md
- Tests

CORRECTNESS REQUIREMENTS — bugs here are statistically silent. Test adversarially.
- An experiment below required n resolves INCONCLUSIVE. Test with exactly n-1.
- A veto rejects regardless of how large the performance gain is.
- When correlation.ts reports the proxy untrustworthy, promotion on tier-1 signal alone
  is refused.
- Blast radius and cooldown are enforced against CONCURRENT proposals, not just
  sequential ones.
- Records excluded by version incompatibility are absent from scoring inputs. Assert this
  directly rather than trusting the kb layer.
- Consumer-supplied reward weights are validated: weights that do not sum as REWARD.md
  requires are rejected at config load, not silently normalized.
- Write at least four tests that attempt to make the engine emit a confident verdict it
  is not entitled to. All must fail to do so.

DO NOT: add heuristics, tie-breakers, or reasonable-sounding defaults not in REWARD.md.
Where REWARD.md is silent, the engine refuses to decide.

VERIFY: pnpm --filter @harness/engine typecheck && test && build && publint
```

---

## STAGE 7 — `@harness/astro` + CLI · **Sonnet 5**

```
[UNIVERSAL PREAMBLE]

INPUTS: docs/CONTRACTS.md, docs/PUBLIC_API.md, packages/flags/, packages/renderers/,
        packages/measure/, packages/engine/

TASK: Implement the Astro integration and CLI. This is the entire surface most consumers
will ever touch, so error quality matters more here than anywhere else.

OUTPUTS:
- src/integration.ts   Astro integration: loads harness.config.ts, validates it, registers
                       detected renderer adapters, wires per-island resolution into the
                       build, enforces budgets at build time
- src/vite-plugin.ts   build-time hooks feeding tier 0 attribution
- src/cli/init.ts      scaffold harness.config.ts, config/baseline.json, .harness/kb/,
                       and .agent/ into a consumer repo; never overwrite existing files
- src/cli/measure.ts   run tier 0/1 collection, write results
- src/cli/propose.ts   emit a proposal for validation
- src/cli/resolve.ts   resolve an open experiment
- src/cli/doctor.ts    diagnose consumer setup: missing peers, invalid config, version
                       skew in KB records
- bin entry, exports per PUBLIC_API.md
- Tests

REQUIREMENTS
- Budget breach fails the BUILD, not a warning. Name the route, island, field, budget,
  and actual value.
- init is idempotent and never destructive. Existing files are reported and skipped.
- Every CLI command exits non-zero on failure with a message stating the fix.
- doctor must detect: renderer in config but peer not installed, config schema older than
  the installed harness, and KB records excluded by version incompatibility.

DO NOT: implement decision logic here — call into @harness/engine. Do not read consumer
island source; the adapters handle that.

VERIFY: pnpm --filter @harness/astro typecheck && test && build && publint
```

---

## STAGE 8 — `@harness/agent` Templates · **Opus 5**

```
[UNIVERSAL PREAMBLE]

INPUTS: docs/CONTRACTS.md, docs/REWARD.md, packages/engine/, packages/kb/

TASK: Write the operating rules for the model that runs the loop in consumers' repos.
That model is Sonnet 5, with no access to this conversation, no repo-wide context, no
ability to ask questions, and working in a codebase you have never seen. Write for that.

OUTPUTS:
- templates/SYSTEM.md              loaded every run: loop protocol, hard prohibitions,
                                   escalation conditions, exact output format
- templates/PROPOSAL.schema.json   strict JSON Schema; additionalProperties false, every
                                   field constrained to its closed enum
- templates/playbooks/propose.md   reading KB evidence, forming a falsifiable prediction;
                                   worked good and bad examples
- templates/playbooks/resolve.md   comparing outcome to prediction, writing the KB record,
                                   including the inconclusive case
- templates/playbooks/escalate.md  conditions requiring a human, and the report format
- src/index.ts                     template resolution for the CLI's init command
- Tests asserting worked examples validate or fail against the schema as intended

REQUIREMENTS
- Enumerate failure modes explicitly, one rule each: proposing without citing evidence,
  changing more than one dimension, resolving underpowered experiments, reading stale
  metrics, re-proposing a previously failed change, quietly widening scope, and citing a
  KB record excluded by version incompatibility.
- Every rule must be checkable from the proposal artifact alone. A rule requiring
  interpretation of intent is not a rule.
- Templates are consumer-editable after scaffolding. Mark clearly which sections are
  safe to edit and which are load-bearing for engine guarantees.
- At least two worked examples must be REJECTED proposals, with the reason stated.

DO NOT: write principles, aspirational guidance, or tone instructions. Every line is a
checkable rule or a worked example.

VERIFY: run PROPOSAL.schema.json against every worked example — good ones validate, bad
ones fail with the documented reason.
```

---

## STAGE 9 — Fixtures, Integration, Publish, DoD · **Sonnet 5**

```
[UNIVERSAL PREAMBLE]

INPUTS: whole repo, docs/CONTRACTS.md, docs/PUBLIC_API.md, DoD checklist below

TASK: Build fixture consumers, verify the package works from the outside, report honestly.

OUTPUTS:
- fixtures/minimal/          smallest valid consumer app
- fixtures/multi-renderer/   one island across every adapter
- fixtures/legacy-config/    old-schema config, for migration and doctor tests
- scripts/verify-dod.ts      one executable check per DoD item
- README.md per package      install, quickstart, API reference
- docs/DOD_REPORT.md         pass/fail per item with evidence

DOD CHECKLIST
1. Fresh consumer: `npm i` + `harness init` + `build` succeeds with zero manual steps.
2. Same island builds under two adapters producing measurably different bundles. Record
   both numbers.
3. Constraint validator rejects a deliberately illegal config with the correct code.
4. Flipping one flag in baseline.json changes shipped output with zero code edits.
5. Config naming an uninstalled renderer fails with an actionable message, not a
   resolution error.
6. Budget breach fails the build and names route, island, field, budget, and actual.
7. Consumer KB record outranks a contradicting seed record. Proven by test.
8. Package upgrade leaves consumer KB records untouched. Proven by test.
9. Version-incompatible record is excluded from scoring but visible to doctor.
10. Seeded proposal flows propose → validate → reject-on-budget-breach, reason persisted.
11. Rollback of a promoted config is a single revert, no manual steps.
12. publint and are-the-types-wrong pass on every package. No deep import reaches an
    internal module.

DO NOT: mark an item passing without an executable check. Do not weaken a check to make
it pass. A failing item reported honestly is the correct output — report FAIL with the
specific reason and stop.

VERIFY: pnpm verify-dod
```

---

## NOTES

- Stages 3, 4, 5 run concurrently once Stage 2 lands. Stage 3 fans out to one cheap
  session per adapter and remains the bulk of code volume at the lowest cost.
- Before escalating a stuck stage from Sonnet 5 to Opus 5, raise **effort** first. Usually
  cheaper and often sufficient.
- A wrong Haiku output is nearly always an underspecified prompt, not a model limit.
  Tighten OUTPUTS and DO NOT before switching models.
- Stage 0 is the only stage worth re-running from scratch. Everything inherits it.
- **Get the RendererAdapter interface right in Stage 0.** It is the one type that
  determines whether adding a framework in six months is additive or a major version. If
  Stage 3 finds itself wanting to modify anything outside packages/renderers, that is a
  Stage 0 defect — go back rather than working around it.
