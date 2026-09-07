# Recovery — Reconciliation Before Stage 3

Stage 2 surfaced a structural divergence between three artifacts that all claim authority over package layout:

| Artifact | Claims |
|---|---|
| `docs/CONTRACTS.md` §15 | `src/contracts/...` layout |
| Stage 1 skeleton (actual repo) | `packages/{contracts,islands,renderers,...}` |
| Stage 2 prompt (template) | `packages/flags/` |

Only the first two were legitimate. The third was carried over from a template written before Stage 0 ran. **`docs/CONTRACTS.md` and `docs/PUBLIC_API.md` are the authority.** Everything else reconciles to them.

Do not run Stage 3 until 2.5 and 2.6 are complete.

---

## AMENDED UNIVERSAL PREAMBLE

Replace the SCOPE RULES block in every remaining stage prompt with this. The change is the new second bullet — contradiction now halts rather than proceeding.

```
SCOPE RULES
- Produce exactly the files under OUTPUTS. No extras.
- STRUCTURAL CONTRADICTION IS A HALT CONDITION. If any OUTPUTS path, type name, function
  signature, or package name in this prompt does not exist in or contradicts
  docs/CONTRACTS.md, docs/PUBLIC_API.md, or the actual repository tree, STOP IMMEDIATELY
  and emit:
      BLOCKED: contradiction — <prompt says X> vs <artifact says Y> at <location>
  Do not build the prompt's version. Do not build both. Do not build a reconciled guess.
  Writing code at a path no frozen artifact recognizes creates orphan work, which is
  worse than building nothing.
- AMBIGUITY is different from contradiction and is handled differently: if a requirement
  is underspecified but not contradicted, append the question to docs/OPEN_QUESTIONS.md,
  implement the most conservative reading, and continue.
- If a required INPUT file is not listed in this prompt but is needed to implement
  correctly, that is a contradiction, not an ambiguity. Halt.
- Make no design decisions. Do not refactor, rename, or reformat outside OUTPUTS. Do not
  add undeclared dependencies.
```

---

## STAGE 2.5 — Reconciliation · **Opus 5**

> Run interactively, in `plan` mode first. Read the plan before allowing writes.
> This stage has design authority; it is the only exception to the frozen-docs rule, and
> only where it proves CONTRACTS is internally inconsistent.

Permission scope: `Edit(./packages/**)`, `Write(./packages/**)`, `Edit(./docs/**)`, `Write(./docs/**)`

```
You are reconciling a structural divergence discovered at the end of Stage 2. Three
artifacts disagree about package layout. Your job is to establish a single ground truth
and make the repository match it.

INPUTS: docs/CONTRACTS.md, docs/PUBLIC_API.md, docs/STAGE_INPUTS.md, docs/REWARD.md,
        docs/adr/, docs/OPEN_QUESTIONS.md, the full repository tree, packages/flags/

PHASE 1 — DIAGNOSE (read-only; produce this before writing anything)

Produce docs/RECONCILIATION.md containing:

  a. The authoritative package layout, quoted from CONTRACTS.md §15 and PUBLIC_API.md's
     exports maps. If those two disagree with each other, say so explicitly — that is a
     Stage 0 defect and changes the remedy.
  b. The actual repository tree as built by Stage 1, and every point where it deviates
     from (a).
  c. Every artifact produced by Stage 2 under packages/flags/, mapped to where it belongs
     under (a) — or marked ORPHAN if it corresponds to nothing in the frozen contracts.
  d. The stage numbering in STAGE_INPUTS.md compared to the numbering used by the prompts
     actually executed. State the mapping explicitly. Stage 2's report referenced "Stage
     2's job per CONTRACTS" while executing under a prompt labelled Stage 2, so the two
     schemes are known to differ.
  e. For each of the four items in the Stage 2 report, state the correct resolution:
       1. packages/flags/ location
       2. resolve() signature and the missing per-island build profile type
       3. budget.ts and veto V001 — REWARD.md was omitted from Stage 2's INPUTS
       4. constraint C005 deferral and which stage genuinely owns it

PHASE 2 — DECIDE

For each divergence, choose exactly one remedy and record why:
  - MIGRATE   move Stage 2's code to the CONTRACTS-specified location. Default choice.
  - AMEND     change CONTRACTS.md. Permitted ONLY where you can demonstrate CONTRACTS is
              internally inconsistent or contradicts PUBLIC_API.md. Requires a new ADR
              stating what changed, why the frozen doc was wrong, and what downstream
              work is invalidated.
  - DISCARD   delete orphan code that corresponds to nothing in the contracts.

Bias hard toward MIGRATE. CONTRACTS is frozen because everything inherits it; amending it
invalidates work already done. Amend only on proof, not on preference.

PHASE 3 — EXECUTE

  - Apply the remedies. Move code to correct paths, update imports, delete orphans.
  - Complete the work Stage 2 could not: veto V001's baseline-comparison rule in budget
    evaluation, now that REWARD.md is available to you.
  - Keep Stage 2's array-of-breaching-fields return shape. It was a correct deviation —
    reporting a single field would hide simultaneous breaches. Record this in the ADR.
  - Resolve or explicitly re-scope every entry Stage 2 added to docs/OPEN_QUESTIONS.md.
  - Write docs/decisions/02-reconciliation.md using the standard decision-record template.

VERIFY: the reconciled package typechecks, tests, and builds under its CONTRACTS-specified
name; no directory exists that is absent from PUBLIC_API.md's exports maps; and
docs/RECONCILIATION.md phase 1(c) shows zero remaining ORPHAN entries.

DO NOT: amend CONTRACTS.md to make the existing code convenient. If migration is painful,
migrate anyway and note the cost in the decision record.
```

---

## STAGE 2.6 — Regenerate Downstream Prompts · **Opus 5**

> This eliminates the root cause. After this stage, prompts derive from the frozen
> artifacts rather than from a template that predates them.

Permission scope: `Write(./prompts/**)`, `Edit(./prompts/**)`

```
You are generating the executable prompts for stages 3 onward. The previous prompts were
written from a template that predated Stage 0 and hardcoded package names, type names, and
function signatures that Stage 0 later designed differently. That mismatch caused a
structural failure at Stage 2. Your job is to make the prompts derive from the frozen
artifacts so it cannot recur.

INPUTS: docs/CONTRACTS.md, docs/PUBLIC_API.md, docs/STAGE_INPUTS.md, docs/REWARD.md,
        docs/RECONCILIATION.md, docs/adr/, the repository tree,
        and the attached previous plan (for intent only — never for names or paths)

TASK: For every remaining stage in STAGE_INPUTS.md, emit prompts/stage-NN.md.

Use STAGE_INPUTS.md's stage numbering, not the attached plan's. Emit
prompts/STAGE_MAP.md mapping between the two schemes for a human reader.

Each generated prompt must contain:
  - The AMENDED UNIVERSAL PREAMBLE (attached), verbatim
  - INPUTS: copied exactly from STAGE_INPUTS.md for that stage. If a stage plainly needs a
    file STAGE_INPUTS.md omits — as Stage 2 needed REWARD.md and did not have it — add it
    and record the correction in prompts/STAGE_MAP.md.
  - OUTPUTS: every path, package name, and file name taken from PUBLIC_API.md and
    CONTRACTS.md. Never from the attached plan.
  - Type names and function signatures quoted from CONTRACTS.md, with section references.
  - Requirements and test requirements: take the *intent* from the attached plan, but
    re-express every identifier against the frozen contracts.
  - The DOCUMENTATION OUTPUT block (attached)
  - A VERIFY command using the real package name from PUBLIC_API.md

VALIDATION — perform before finishing, and report results:
  For every identifier appearing in every generated prompt — package name, file path, type
  name, function signature, error code — confirm it exists in CONTRACTS.md or
  PUBLIC_API.md. List any that do not. There must be none. An identifier that appears only
  in the attached plan is exactly the bug that caused this recovery.

Also emit prompts/STAGE_MAP.md containing:
  - Old plan stage number → STAGE_INPUTS.md stage number
  - Model assignment per stage, carried from the attached plan
  - Write scope per stage, derived from that stage's OUTPUTS
  - Any INPUTS corrections you made, with reasoning
  - Which stage genuinely owns constraint C005, per RECONCILIATION.md

DO NOT: invent a stage that STAGE_INPUTS.md does not define. Do not carry any package
name, path, or type name from the attached plan without confirming it in the frozen
artifacts first.
```

---

## AFTER RECOVERY

Update `run-stages.sh` from `prompts/STAGE_MAP.md` — the stage table's names, models, write
scopes, and verify commands all need to come from there rather than the hardcoded
`@harness/*` names currently in the script. Those names are from the same bad template.

Then resume unattended execution from the first remaining stage.

**Sanity check before the next unattended batch:** run one regenerated stage interactively
and confirm it neither halts on contradiction nor writes outside its scope. If a
regenerated prompt still produces a `BLOCKED: contradiction`, the reconciliation is
incomplete — go back to 2.5 rather than working around it.
