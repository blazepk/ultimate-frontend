# Revised Plan — Stages 3 Onward

Stages 0–2 are complete. This replaces stages 3–9 and adds a permissions pre-flight plus a documentation track.

Three changes from the previous version:

1. **Approval friction is solved with scoped permissions, not by changing models.** Each stage writes to exactly one package, so writes are auto-approved *within that path* and prompt outside it.
2. **Every stage now produces a decision record.** Not an ADR — those capture design intent from Stage 0. These capture what was actually built, what was rejected during implementation, and what would break it.
3. **A final explainer stage** turns scattered records into something a human can read cold and understand the system from.

---

## PRE-FLIGHT — Permission Configuration

Claude Code evaluates rules in a fixed order: <cite index="15-1">deny first, then ask, then allow — the first matching rule wins, so deny always takes precedence.</cite> <cite index="15-1">Rules use `Tool` or `Tool(specifier)` format, and Bash specifiers support glob patterns where the space before `*` matters: `Bash(ls *)` matches `ls -la` but not `lsof`.</cite>

Create `.claude/settings.json` at the repo root with the always-safe baseline:

```json
{
  "permissions": {
    "allow": [
      "Read", "Grep", "Glob",
      "Bash(pnpm typecheck*)",
      "Bash(pnpm test*)",
      "Bash(pnpm build*)",
      "Bash(pnpm --filter * test*)",
      "Bash(pnpm --filter * typecheck*)",
      "Bash(pnpm --filter * build*)",
      "Bash(pnpm publint*)",
      "Bash(git status*)",
      "Bash(git diff*)",
      "Bash(git log*)"
    ],
    "ask": [
      "Bash(git commit*)",
      "Bash(pnpm install*)",
      "Bash(pnpm add*)"
    ],
    "deny": [
      "Bash(git push*)",
      "Bash(npm publish*)",
      "Bash(pnpm publish*)",
      "Bash(rm *)",
      "Bash(sudo*)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Edit(./.env*)"
    ]
  }
}
```

Then per stage, add a write scope. Before starting Stage 4, for example:

```json
{ "permissions": { "allow": ["Edit(./packages/measure/**)", "Write(./packages/measure/**)"] } }
```

Swap that one line between stages. Writes inside the target package go through silently; anything outside still prompts — which is exactly the signal you want, since a stage reaching outside its package is the scope violation the prompts were meant to catch in the first place.

**Modes, for reference.** <cite index="16-1">The available modes are default, acceptEdits, plan, dontAsk, bypassPermissions, and auto,</cite> settable in-session or via `--permission-mode`. Useful ones here:

- **`plan`** — <cite index="14-1">the model can read, search, and reason but cannot edit, write, or run anything that mutates state.</cite> Start each stage in plan mode, read the plan, then switch to execute. This is where your review attention actually belongs.
- **`acceptEdits`** — <cite index="14-1">auto-approves Edit and Write; reads and Bash still follow the rules.</cite> Good default once a stage's scope is set.
- **`dontAsk`** — <cite index="10-1">converts any permission prompt into a denial; tools pre-approved by allow rules or hooks run normally, everything else is denied without prompting.</cite> This is the right mode for the runtime loop in CI: a fixed tool surface, no human, hard deny on anything unlisted.
- <cite index="14-1">`/permissions` opens an interactive view of active rules and which file each came from</cite> — use it when something prompts that shouldn't.

Avoid `bypassPermissions`. <cite index="10-1">It approves every tool, not just listed ones, and `allowed_tools` does not constrain it.</cite> The scoped-write approach gets you the same silence with the guardrail intact.

**Where your review should go instead:** each stage ends with a passing VERIFY and a git diff. Review the diff at the stage boundary, once, with tests already green. That is a better use of the same attention than approving individual writes, and it catches things per-write approval structurally cannot — like a stage that did everything correctly but built the wrong thing.

---

## DOCUMENTATION TRACK

Every stage from here adds one file: `docs/decisions/NN-<stage-name>.md`. Append this block to every stage prompt below.

```
DOCUMENTATION OUTPUT (required)

Also produce docs/decisions/NN-<stage-name>.md using exactly this structure:

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

Write for someone reading in six months with no memory of this work. Do not restate the
prompt back. Do not describe the code line by line — describe the reasoning.
```

---

## STAGE 3 — Renderer Adapters · **Sonnet 5** *(parallel: one per adapter)*

Permission scope: `Edit(./packages/renderers/**)`, `Write(./packages/renderers/**)`, `Write(./fixtures/multi-renderer/**)`

```
[UNIVERSAL PREAMBLE] [DOCUMENTATION OUTPUT BLOCK]

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
- docs/decisions/03-<RENDERER>-adapter.md

Implement every RendererAdapter member: framework detection, hydration directive mapping,
prop serialization, event binding, bundle attribution reporting, declared capability set.

REQUIREMENTS
- <RENDERER> is an OPTIONAL peer dependency. Importing this adapter when the framework is
  absent must produce a message naming the missing package and the install command —
  never a module resolution failure.
- Declare capabilities honestly. If <RENDERER> cannot support a hydration mode, report
  that and let the constraint layer enforce it. Never silently degrade.
- Fixture island stays minimal: one piece of state, one event, one a11y requirement.

DO NOT: modify types.ts, touch another adapter, add state management libraries, introduce
global side effects, or make this adapter required by any other package.

VERIFY: pnpm --filter @harness/renderers test -- <RENDERER> && pnpm build
```

---

## STAGE 4 — `@harness/measure` · **Sonnet 5**

Permission scope: `Edit(./packages/measure/**)`, `Write(./packages/measure/**)`

```
[UNIVERSAL PREAMBLE] [DOCUMENTATION OUTPUT BLOCK]

INPUTS: docs/CONTRACTS.md, docs/REWARD.md, docs/PUBLIC_API.md, packages/measure/

TASK: Implement tiered measurement collection.

OUTPUTS:
- src/tier0.ts        parse build output: bundle bytes, module count, per-island
                      attribution; emit MeasurementSample
- src/tier1.ts        Playwright + Lighthouse under pinned throttling
- src/determinism.ts  N repeated runs, median-of-medians, variance reporting; samples
                      exceeding the REWARD.md coefficient-of-variation threshold are
                      marked ADVISORY_ONLY
- src/beacon.ts       client RUM beacon to a consumer-configured endpoint; under 1KB
- src/index.ts        exports per PUBLIC_API.md
- Tests using fixtures; no live network in tests
- docs/decisions/04-measurement.md

DETERMINISM REQUIREMENTS (non-negotiable)
- CPU throttle multiplier and network profile are explicit config, never defaults.
- Every sample records runner fingerprint: CPU model, core count, memory.
- Samples with differing fingerprints must never be compared. Enforce in the collector.
- Every emitted sample carries harness_version.

PACKAGE REQUIREMENTS
- Playwright and Lighthouse are optional peers. Missing them degrades to a clear
  "tier 1 unavailable, install X" state, not a crash.
- The beacon is a separate entry point so consumers not using RUM pay zero bytes.

DO NOT: implement reward scoring, promotion logic, or anything from the engine.

VERIFY: pnpm --filter @harness/measure typecheck && test && build && publint
```

---

## STAGE 5 — `@harness/kb` · **Sonnet 5**

Permission scope: `Edit(./packages/kb/**)`, `Write(./packages/kb/**)`

```
[UNIVERSAL PREAMBLE] [DOCUMENTATION OUTPUT BLOCK]

INPUTS: docs/CONTRACTS.md (KBRecord, precedence rules, version-stamping sections)

TASK: Implement the two-layer knowledge base.

OUTPUTS:
- src/schema.ts   KBRecord transcribed from CONTRACTS.md
- src/merge.ts    merge package seed layer with consumer layer, applying precedence
- src/query.ts    query by route pattern + config delta, strict precedence order
- src/write.ts    append to the CONSUMER layer only; reject malformed input
- src/compat.ts   version-compatibility predicate; excludes records written under an
                  incompatible reward schema
- seed/*.json     package-shipped external records: hydration cost models, island
                  granularity, streaming SSR, per-framework bundle baselines. Each
                  evidence_type "external", confidence <= 0.5, with a source URL.
- Tests
- docs/decisions/05-knowledge-base.md

CRITICAL REQUIREMENTS
- The seed layer is READ-ONLY. write.ts must be structurally incapable of modifying it.
- Consumer records outrank package records unconditionally.
- Version-incompatible records are EXCLUDED from scoring, not down-weighted. They remain
  queryable for audit, clearly marked.
- Package upgrade must never touch consumer records. Test explicitly.

TEST REQUIREMENTS
- One test per precedence rule, hand-built fixtures.
- superseded_by records never returned as active.
- Record missing a required field rejected on write.
- Consumer and seed record making contradictory claims: consumer wins.
- Version-incompatible record excluded from scoring, visible in audit output.

VERIFY: pnpm --filter @harness/kb typecheck && test && build && publint
```

---

## STAGE 6 — `@harness/engine` · **Opus 5**

Permission scope: `Edit(./packages/engine/**)`, `Write(./packages/engine/**)`

> Run this stage in `plan` mode first. Read the plan before letting it write. This is the
> one stage where a wrong approach is expensive to discover late.

```
[UNIVERSAL PREAMBLE] [DOCUMENTATION OUTPUT BLOCK]

INPUTS: docs/CONTRACTS.md, docs/REWARD.md, packages/flags/, packages/kb/, packages/measure/

TASK: Implement proposal validation, experiment lifecycle, and promotion logic.

OUTPUTS:
- src/reward/score.ts        composite reward per REWARD.md; vetoes short-circuit before
                             any weighting is applied
- src/reward/power.ts        minimum sample size from baseline variance and target effect
- src/reward/correlation.ts  rolling lab-to-field correlation; emits trustworthy /
                             untrustworthy verdict on the proxy signal
- src/decide/validate.ts     proposal schema + constraint + cooldown + blast-radius checks
- src/decide/lifecycle.ts    propose → deploy → measure → resolve; writes a KB record on
                             EVERY resolution including inconclusive
- src/decide/rollback.ts     trigger evaluation and revert emission
- src/index.ts               exports per PUBLIC_API.md
- Tests
- docs/decisions/06-decision-engine.md

CORRECTNESS REQUIREMENTS — bugs here are statistically silent. Test adversarially.
- Experiment below required n resolves INCONCLUSIVE. Test with exactly n-1.
- A veto rejects regardless of how large the performance gain is.
- When correlation reports the proxy untrustworthy, promotion on tier-1 alone is refused.
- Blast radius and cooldown enforced against CONCURRENT proposals, not just sequential.
- Version-excluded records absent from scoring inputs. Assert directly rather than
  trusting the kb layer.
- Consumer-supplied reward weights validated at config load; weights that do not sum as
  REWARD.md requires are rejected, never silently normalized.
- At least four tests that attempt to make the engine emit a confident verdict it is not
  entitled to. All must fail to do so.

For docs/decisions/06: the "Load-bearing assumptions" section is the most important one in
the whole documentation set. Every statistical assumption — variance model, independence,
what the correlation threshold implies — belongs there with its failure mode named.

DO NOT: add heuristics, tie-breakers, or reasonable-sounding defaults absent from
REWARD.md. Where REWARD.md is silent, the engine refuses to decide.

VERIFY: pnpm --filter @harness/engine typecheck && test && build && publint
```

---

## STAGE 7 — `@harness/astro` + CLI · **Sonnet 5**

Permission scope: `Edit(./packages/astro/**)`, `Write(./packages/astro/**)`

```
[UNIVERSAL PREAMBLE] [DOCUMENTATION OUTPUT BLOCK]

INPUTS: docs/CONTRACTS.md, docs/PUBLIC_API.md, packages/flags/, packages/renderers/,
        packages/measure/, packages/engine/

TASK: Implement the Astro integration and CLI — the entire surface most consumers ever
touch. Error message quality matters more here than anywhere else in the package.

OUTPUTS:
- src/integration.ts   loads harness.config.ts, validates it, registers detected adapters,
                       wires per-island resolution into the build, enforces budgets
- src/vite-plugin.ts   build-time hooks feeding tier 0 attribution
- src/cli/init.ts      scaffold harness.config.ts, config/baseline.json, .harness/kb/,
                       .agent/ into a consumer repo; never overwrite existing files
- src/cli/measure.ts   run tier 0/1 collection, write results
- src/cli/propose.ts   emit a proposal for validation
- src/cli/resolve.ts   resolve an open experiment
- src/cli/doctor.ts    diagnose consumer setup: missing peers, invalid config, KB version
                       skew
- bin entry, exports per PUBLIC_API.md
- Tests
- docs/decisions/07-integration-cli.md

REQUIREMENTS
- Budget breach fails the BUILD, not a warning. Name route, island, field, budget, actual.
- init is idempotent and never destructive. Existing files reported and skipped.
- Every CLI command exits non-zero on failure with a message stating the fix.
- doctor detects: renderer in config but peer not installed, config schema older than the
  installed harness, KB records excluded by version incompatibility.

DO NOT: implement decision logic here — call into @harness/engine. Do not read consumer
island source; adapters handle that.

VERIFY: pnpm --filter @harness/astro typecheck && test && build && publint
```

---

## STAGE 8 — `@harness/agent` Templates · **Opus 5**

Permission scope: `Edit(./packages/agent/**)`, `Write(./packages/agent/**)`

```
[UNIVERSAL PREAMBLE] [DOCUMENTATION OUTPUT BLOCK]

INPUTS: docs/CONTRACTS.md, docs/REWARD.md, packages/engine/, packages/kb/

TASK: Write the operating rules for the model that runs the loop in consumers' repos.
That model is Sonnet 5 or Haiku 4.5, with no access to this conversation, no repo-wide
context, no ability to ask questions, in a codebase you have never seen. Write for that.

OUTPUTS:
- templates/SYSTEM.md              loop protocol, hard prohibitions, escalation
                                   conditions, exact output format
- templates/PROPOSAL.schema.json   strict; additionalProperties false, every field a
                                   closed enum
- templates/playbooks/propose.md   reading KB evidence, forming a falsifiable prediction;
                                   worked good and bad examples
- templates/playbooks/resolve.md   comparing outcome to prediction, writing the KB record,
                                   including the inconclusive case
- templates/playbooks/escalate.md  conditions requiring a human, and report format
- templates/settings.json          Claude Code permissions for the runtime loop: dontAsk
                                   mode, fixed tool surface, writes scoped to .harness/
                                   and config/candidates/ only, hard deny on git push and
                                   any edit to config/baseline.json
- src/index.ts                     template resolution for the CLI's init command
- Tests asserting worked examples validate or fail against the schema as intended
- docs/decisions/08-agent-runtime.md

REQUIREMENTS
- Enumerate failure modes, one rule each: proposing without citing evidence, changing more
  than one dimension, resolving underpowered experiments, reading stale metrics,
  re-proposing a previously failed change, quietly widening scope, citing a
  version-excluded KB record.
- Every rule checkable from the proposal artifact alone. A rule requiring interpretation
  of intent is not a rule.
- The runtime loop must require ZERO human approvals in the normal path. Every action it
  takes is either pre-approved by templates/settings.json or schema-validated by the
  engine. Human involvement is triggered by escalate.md conditions only.
- Templates are consumer-editable after scaffolding. Mark which sections are safe to edit
  and which are load-bearing for engine guarantees.
- At least two worked examples must be REJECTED proposals with the reason stated.

DO NOT: write principles, aspirational guidance, or tone instructions. Every line is a
checkable rule or a worked example.

VERIFY: run PROPOSAL.schema.json against every worked example — good validate, bad fail
with the documented reason.
```

---

## STAGE 9 — Fixtures, Integration, DoD · **Sonnet 5**

Permission scope: `Edit(./fixtures/**)`, `Write(./fixtures/**)`, `Write(./scripts/**)`, `Edit(./packages/*/README.md)`

```
[UNIVERSAL PREAMBLE] [DOCUMENTATION OUTPUT BLOCK]

INPUTS: whole repo, docs/CONTRACTS.md, docs/PUBLIC_API.md, DoD checklist below

TASK: Build fixture consumers, verify the package from the outside, report honestly.

OUTPUTS:
- fixtures/minimal/          smallest valid consumer app
- fixtures/multi-renderer/   one island across every adapter
- fixtures/legacy-config/    old-schema config for migration and doctor tests
- scripts/verify-dod.ts      one executable check per DoD item
- README.md per package      install, quickstart, API reference
- docs/DOD_REPORT.md         pass/fail per item with evidence
- docs/decisions/09-integration.md

DOD CHECKLIST
1. Fresh consumer: install + `harness init` + build succeeds, zero manual steps.
2. Same island builds under two adapters with measurably different bundles. Record both.
3. Constraint validator rejects a deliberately illegal config with the correct code.
4. Flipping one flag in baseline.json changes shipped output with zero code edits.
5. Config naming an uninstalled renderer fails with an actionable message.
6. Budget breach fails the build naming route, island, field, budget, actual.
7. Consumer KB record outranks a contradicting seed record. Proven by test.
8. Package upgrade leaves consumer KB records untouched. Proven by test.
9. Version-incompatible record excluded from scoring, visible to doctor.
10. Seeded proposal flows propose → validate → reject-on-budget-breach, reason persisted.
11. Rollback of a promoted config is a single revert, no manual steps.
12. publint and are-the-types-wrong pass on every package. No deep import reaches an
    internal module.

DO NOT: mark an item passing without an executable check. Do not weaken a check to pass.
A failing item reported honestly is the correct output — report FAIL with the specific
reason and stop.

VERIFY: pnpm verify-dod
```

---

## STAGE 10 — Explainer · **Opus 5** *(new)*

Permission scope: `Write(./docs/**)`, `Edit(./docs/**)`

```
[UNIVERSAL PREAMBLE]

INPUTS: docs/ in full — CONTRACTS.md, PUBLIC_API.md, REWARD.md, adr/, decisions/,
        OPEN_QUESTIONS.md, DOD_REPORT.md

TASK: Synthesize the scattered records into documentation a human can read cold. The
decision records were written stage by stage by models that could not see each other's
work. Your job is the connective tissue and the honest overall assessment.

OUTPUTS:

1. docs/EXPLAINER.md — how the system works, for a reader who has never seen it:
   - What problem this solves and what it deliberately does not solve
   - The flow end to end: config → resolution → build → measurement → proposal →
     validation → experiment → resolution → KB
   - Why the flag space is closed, and what would break if it were opened
   - Why measurement is tiered, and what each tier is and is not trusted for
   - Why the KB is two-layer and why consumer records win
   - What the loop can decide autonomously vs what requires a human, and why the line is
     drawn there

2. docs/WHY.md — the decision narrative. Trace the reasoning chain: Astro as substrate →
   per-island framework choice → closed flag space → bounded proposals → cheap models in
   the loop. Each link should read as a consequence of the previous one. A reader should
   finish understanding why the alternatives were worse, not just what was chosen.

3. docs/FAILURE_MODES.md — consolidate every "load-bearing assumption" from
   docs/decisions/*. For each: what is assumed, where it is assumed, what breaks, and how
   you would notice. Order by how quietly it fails, not by severity — silent failures
   first, because those are the ones that need documentation most.

4. docs/OPERATING.md — running this in practice: reading a DOD_REPORT, interpreting an
   INCONCLUSIVE resolution, what to do when correlation reports the proxy untrustworthy,
   when to distrust the loop, how to audit a promoted config after the fact.

REQUIREMENTS
- Where decision records conflict or a later stage undermined an earlier assumption, say
  so plainly in EXPLAINER.md. Do not smooth it over.
- Where a DoD item failed, EXPLAINER.md must state the resulting limitation in the
  relevant section. Documentation that describes an aspirational system is worse than
  none.
- No marketing register. This is for you and future engineers, not for a landing page.
- Every claim about behaviour must be traceable to a file. If you cannot find the
  supporting code, write it as an open question, not an assertion.

DO NOT: modify anything under docs/adr/ or docs/decisions/ — those are historical records.
Do not restate CONTRACTS.md; link to it.

VERIFY: every DoD item marked FAIL appears as a stated limitation in EXPLAINER.md; every
load-bearing assumption in docs/decisions/* appears in FAILURE_MODES.md.
```

---

## OPERATING NOTES

- **Per-stage rhythm:** set the write scope in settings.json → start in `plan` mode → read
  the plan → switch to `acceptEdits` → let it run to VERIFY → review the git diff once.
  Your attention goes to the plan and the diff, not the writes in between.
- **A prompt outside the stage's package is a signal, not noise.** It means the stage is
  reaching beyond its scope. Investigate rather than approving.
- **Before escalating a stuck stage from Sonnet 5 to Opus 5, raise effort first.**
- **Haiku's place is the runtime loop, not the build.** Its output there is
  schema-validated by the engine and runs under `dontAsk` in CI, so it needs no human in
  the path. Anywhere a human must review Haiku's work, the supervision cost exceeds the
  token savings by a wide margin — use Sonnet 5 instead.
