# Scaffolding Prompt — Adaptive Multi-Framework Frontend Harness

> Paste this into an agentic coding tool (Claude Code, Cowork, etc.) as the task spec.
> It is written so a mid-tier model can execute it deterministically without judgment calls.

---

## ROLE

You are a build agent constructing a **feature-flag-driven frontend harness**. The harness lets a single site render any given route/island using a *choice* of framework and hydration strategy, measure the result, and converge on the optimal configuration over time.

You are **not** designing the site. You are building the machine that decides how the site is built.

---

## NON-NEGOTIABLE INVARIANTS

These are veto conditions. If a step would violate one, stop and emit a `BLOCKED` report instead of proceeding.

1. **The agent never writes production config directly.** It emits a proposal artifact that the harness validates. Human or automated gate promotes it.
2. **One variable per experiment.** A proposal changes exactly one flag dimension for exactly one target. No compound changes.
3. **Every variant must be renderable at HEAD.** No config value may exist that has no working implementation. The build fails closed.
4. **Measurement is deterministic or it is discarded.** Any metric collected on a noisy runner without pinned CPU/network throttling is advisory only, never a reward input.
5. **Rollback is always one commit.** Config is data, not code. Reverting a flag must never require a rebuild of application logic.
6. **Accessibility and correctness are gates, not weights.** They cannot be traded off against performance in the reward function.

---

## TARGET ARCHITECTURE

**Shell:** Astro. It is the only mainstream meta-framework whose island model is natively framework-agnostic, so it can host React, Qwik, Svelte, Solid, and Vue components in the same page without a bespoke integration layer. Astro is the substrate; it is not one of the competing options.

**Islands:** each interactive region declares a *capability contract*, not a framework. The framework is resolved at build time from config.

**Flag space (bounded — do not expand without an ADR):**

| Dimension | Values |
|---|---|
| `renderer` | `static` \| `react` \| `qwik` \| `svelte` \| `solid` |
| `hydration` | `none` \| `load` \| `idle` \| `visible` \| `media` \| `resumable` |
| `render_mode` | `ssg` \| `ssr` \| `isr` \| `edge` |
| `data_strategy` | `inline` \| `deferred` \| `streamed` |

The space is intentionally small and finite. Combinatorial freedom is the enemy of a working reward loop.

**Illegal combinations** must be encoded as constraints, not discovered at runtime — e.g. `renderer: qwik` implies `hydration: resumable`; `renderer: static` implies `hydration: none`.

---

## BUILD LAYER — FIXED, NOT FLAGGED

**The bundler is a constant. Do not make it a flag dimension.**

Astro is Vite-based, and Qwik's optimizer is a Vite plugin — the symbol-level code splitting that enables resumability is performed by that plugin. The architecture determines the bundler. As of Vite 8 the toolchain is Rolldown (bundler) + Oxc (transforms) + Lightning CSS (CSS minification).

Rationale for excluding it from the loop: bundler choice affects **build time and DX**, not user-facing metrics. Output differences between modern bundlers sit in the low single digits and are dominated by minifier and chunking configuration. An experiment on this dimension would resolve as noise and waste traffic that belongs to dimensions with real effect sizes.

**What is tunable — as a build profile bound to `render_mode`, not as a new flag dimension:**

```ts
type BuildProfile = {
  chunking: 'default' | 'vendor-split' | 'route-granular';  // build.rolldownOptions
  inline_asset_limit_kb: number;
  module_preload: 'none' | 'critical' | 'all';
  css_strategy: 'inline-critical' | 'external' | 'per-route';
};
```

## ASSET-LEVEL TOOL SELECTION

This is where "right tool for the right task" produces measurable wins, and where real sites lose Core Web Vitals points. Encode these as per-asset policy, enforced at Tier 0:

| Asset class | Decision | Primary metric at risk |
|---|---|---|
| Images | codec (AVIF/WebP/fallback), responsive `srcset`, `fetchpriority` on LCP candidate | LCP |
| Fonts | subsetting, `font-display`, preload of critical face only | CLS, LCP |
| Third-party scripts | main thread vs web worker offload vs deferred | INP |
| CSS | critical inline vs external, per-route extraction | LCP, CLS |

**Every route must declare its LCP candidate element explicitly.** The Tier 0 gate fails the build if the declared candidate is not preloaded, or if a non-declared element measures as LCP in the Tier 1 run. Guessing at the LCP element is the most common cause of a site that is fast in aggregate and slow where it counts.

## BUDGETS ARE THE GUARANTEE

Tool selection is how a route *meets* its budget. The budget gate is what makes it non-negotiable. Define per-route budgets in `config/baseline.json` and fail the build — not a warning, a failure — on breach:

```json
{ "js_kb": 60, "css_kb": 20, "image_kb": 250, "third_party_kb": 40, "lcp_ms_lab": 1800 }
```

A budget that emits a warning is not a budget.

---

## PACKAGE LAYOUT TO GENERATE

Distributed as a scoped set of packages from one monorepo. The harness knows nothing about any specific site; consumers bring their own islands, config, and budgets.

```
/
├── packages/
│   ├── flags/          @harness/flags      schema, constraints, resolver
│   ├── renderers/      @harness/renderers  per-framework adapters
│   ├── measure/        @harness/measure    tier 0-3 collectors + RUM beacon
│   ├── kb/             @harness/kb         two-layer knowledge base
│   ├── engine/         @harness/engine     reward, power, decisions, rollback
│   ├── astro/          @harness/astro      Astro integration + CLI
│   └── agent/          @harness/agent      .agent templates shipped to consumers
├── fixtures/
│   ├── minimal/                            smallest valid consumer app
│   ├── multi-renderer/                     same island across all adapters
│   └── legacy-config/                      old-schema config, for migration tests
└── docs/
```

**Consumer-side shape** — what a repo importing this looks like:

```
consumer-repo/
├── harness.config.ts      # budgets, reward weights, renderer allowlist
├── config/baseline.json   # their configuration, their lineage
├── .harness/kb/           # their accumulated experiment records
├── .agent/                # scaffolded from @harness/agent, editable
└── src/islands/           # their islands, their contracts
```

---

## DISTRIBUTION CONTRACT

Being a package means the API surface is now a promise to strangers. These become invariants.

**Public vs internal.** Every package declares an explicit `exports` map. Anything not in it is internal and may change in a patch release. No deep imports.

**Peer dependencies, not dependencies.** The harness must never bundle React, Qwik, Svelte, Solid, or Astro. Every renderer is an *optional* peer dependency; the adapter registry detects what the consumer has installed and exposes only those renderers as legal `renderer` values. A config naming an uninstalled renderer fails validation with an actionable message, not a module-resolution stack trace.

**Injectable vs fixed.** Flag *dimensions* are fixed — consumers cannot add dimensions, because the decision engine's guarantees depend on a closed space. Budgets, reward weights, sample-size parameters, and renderer allowlist are all consumer-injected via `harness.config.ts`.

**Version stamping.** Every artifact the harness writes — KB records, experiment results, measurement samples — records the harness version that produced it. The engine must detect records written under an incompatible reward schema and exclude them from scoring rather than silently comparing incomparable numbers. This is the single most likely source of a quietly wrong verdict in a versioned system.

**Semver policy, stated explicitly in docs:** changing a reward normalization function, adding a constraint, or altering the KB precedence order is a **major** version. Consumers' historical data becomes non-comparable across those boundaries and must be migrated or quarantined.

---

## CONFIG SCHEMA

Generate `packages/flags/schema.ts` with roughly this shape:

```ts
type IslandConfig = {
  id: string;
  renderer: 'static' | 'react' | 'qwik' | 'svelte' | 'solid';
  hydration: 'none' | 'load' | 'idle' | 'visible' | 'media' | 'resumable';
  data_strategy: 'inline' | 'deferred' | 'streamed';
  budget: { js_kb: number; };        // hard build-time ceiling
};

type RouteConfig = {
  path: string;
  render_mode: 'ssg' | 'ssr' | 'isr' | 'edge';
  islands: IslandConfig[];
  traffic_weight?: number;           // 0-1, for split allocation
};

type SiteConfig = {
  version: string;
  parent: string | null;             // config lineage — every config knows its ancestor
  routes: RouteConfig[];
};
```

`parent` is load-bearing: it makes the config space a traversable tree, which is what lets the decision engine reason about what has already been tried.

---

## REWARD SPECIFICATION

Generate `packages/harness/reward/` implementing a **tiered** signal, because feedback latency differs by orders of magnitude:

| Tier | Signal | Latency | Role |
|---|---|---|---|
| 0 | Build-time (bundle bytes, module count) | seconds | **Gate** — fail closed on budget breach |
| 1 | Lab (Lighthouse, throttled Playwright traces) | minutes | **Gate + proxy reward** |
| 2 | Synthetic RUM (scripted sessions, throttled) | hours | Proxy reward |
| 3 | Field RUM (real users, p75 CWV) | days | **Ground-truth reward** |
| 4 | Business (search→listing CTR, contact conversion) | weeks | Ground-truth, low power |

Composite reward, evaluated at Tier 3+:

```
R = Σ wᵢ · norm(Δmetricᵢ)  −  Σ penalty(constraint_violations)

where metrics = { LCP_p75, INP_p75, CLS_p75, TTFB_p75, js_transferred }
      norm() maps each to [0,1] against published CWV thresholds
      constraint violations are VETOES, not penalties, for: a11y, error_rate, hydration mismatch
```

**Mandatory: track lab↔field correlation as a first-class metric.** Log the Pearson correlation between Tier-1 predictions and Tier-3 outcomes over a rolling window. When it degrades below a threshold, the proxy has stopped being trustworthy and the loop must halt promotion on lab signal alone. This is the single most important safeguard against the system optimizing a metric that has decoupled from reality.

---

## KNOWLEDGE BASE SCHEMA

`packages/kb/records/*.json`. Records are **evidence**, not advice.

```json
{
  "id": "kb-0041",
  "claim": "resumable rendering reduces INP_p75 on filter-heavy list routes",
  "applies_to": { "route_pattern": "list", "interaction_density": "high" },
  "config_delta": { "renderer": "qwik", "hydration": "resumable" },
  "evidence_type": "internal_experiment",
  "effect": { "metric": "INP_p75", "delta_ms": -84, "ci_95": [-121, -47], "n_sessions": 9400 },
  "observed_at": "2026-07-12",
  "source": "experiments/archive/exp-0041",
  "confidence": 0.82,
  "superseded_by": null
}
```

Precedence rules the query layer must enforce:
1. **Consumer records always outrank package-shipped records.** A site's own measurements beat anything the harness ships with, unconditionally.
2. Internal field experiments outrank internal lab results.
3. Internal results outrank external published claims, always.
4. External claims require a `source` URL and decay in confidence with age.
5. A record with `superseded_by` set is never returned as active evidence.
6. A record whose `harness_version` is incompatible with the running reward schema is excluded from scoring entirely — not down-weighted.

**Two-layer storage.** `@harness/kb` ships a read-only seed layer covering hydration cost models, island granularity tradeoffs, streaming SSR behaviour, and per-framework bundle baselines. Every seeded record is `evidence_type: "external"` with `confidence ≤ 0.5`. Consumers accumulate their own records in `.harness/kb/`, which is writable and always wins. The query layer merges both and applies the ordering above.

The seed layer is what makes the package useful on day one; the consumer layer is where the actual value accrues. Upgrading the package must never touch consumer records.

---

## AGENT LOOP PROTOCOL

Write `.agent/SYSTEM.md` specifying this cycle. The executing model must follow it literally.

```
1. OBSERVE   → read config/baseline.json + latest Tier-3 metrics + open experiments
2. RETRIEVE  → query KB for records matching the target route's pattern
3. PROPOSE   → emit ONE proposal conforming to PROPOSAL.schema.json
                 must cite ≥1 KB record id as justification
                 must state a falsifiable prediction: metric, direction, magnitude
4. VALIDATE  → harness runs: schema check → constraint check → build → Tier 0/1 gates
                 any failure = proposal rejected, reason written to experiments/archive
5. DEPLOY    → split traffic per traffic_weight, blast radius capped
6. MEASURE   → collect until minimum sample size reached OR max duration elapsed
7. RESOLVE   → compare outcome to prediction
                 write new KB record REGARDLESS of outcome (negative results are data)
                 promote, revert, or mark inconclusive
```

**Why proposals are structured JSON and not free-form code:** the model's output is constrained to a validated config delta, so the space of things it can get wrong is bounded by the schema. Implementation code for each `renderer` variant is written once by a human and reused. This is what makes the loop safe to run on a cheaper model — it is choosing from a menu, not authoring arbitrary logic.

---

## GUARDRAILS TO IMPLEMENT

- **Blast radius:** max N concurrent experiments (default 2); max traffic_weight per candidate (default 0.1 initially).
- **Auto-rollback triggers:** JS error rate > baseline + 0.5σ; any Tier-3 CWV metric degrading beyond a hard floor; a11y violation count > 0.
- **Sample-size guard:** the loop must refuse to resolve an experiment below its precomputed minimum n. Emit `INCONCLUSIVE`, never a verdict.
- **Cooldown:** no new proposal targeting a route that has an unresolved experiment.
- **Prediction accountability:** track the model's prediction hit rate over time. A persistently miscalibrated proposer is itself a defect to surface.

---

## DEFINITION OF DONE

The scaffold is complete when all of the following pass:

- [ ] `pnpm build` succeeds with at least two distinct `renderer` values for the same island, producing measurably different bundles
- [ ] Constraint validator rejects a deliberately illegal config (e.g. `qwik` + `hydration: load`) with a clear error
- [ ] Flipping one flag in `config/baseline.json` changes the shipped output with zero application-code edits
- [ ] Tier 0 and Tier 1 collectors run in CI and write structured results to `experiments/`
- [ ] A seeded proposal flows end-to-end: propose → validate → reject-on-budget-breach, with the rejection reason persisted
- [ ] KB query returns records ordered by the precedence rules, verified by a unit test
- [ ] Rollback of any promoted config is a single revert with no manual steps

---

## OUTPUT RULES FOR THE EXECUTING MODEL

- Write files. Do not print file contents into chat as a substitute for writing them.
- Do not invent flag dimensions, metrics, or KB fields not specified above. Propose additions via an ADR in `docs/adr/`, do not implement unilaterally.
- If a specification here is ambiguous, write the ambiguity to `docs/OPEN_QUESTIONS.md` and implement the most conservative reading. Do not guess expansively.
- Every generated module gets a test. Untested harness code is worse than no harness, because it produces confident numbers that are wrong.
