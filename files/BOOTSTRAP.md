# BOOTSTRAP — paste this once

Drop all plan files anywhere in the repo (root or `docs/plan/`), commit so the tree is clean, then run:

```bash
claude --permission-mode plan
```

Paste the block below. Review the plan it presents, approve, and let it run. It stops before Stage 3.

---

```
You are performing a recovery and bootstrap. You are NOT building any package this run.
Do not implement any stage from 3 onward. Stop where instructed.

═══ ORIENT ═══

Locate these files in the repo (root or docs/plan/) and read them:

  recovery-reconciliation-stages.md      AUTHORITATIVE for this run. Contains Stage 2.5,
                                         Stage 2.6, and the AMENDED UNIVERSAL PREAMBLE.
  harness-stages-3-onward-revised.md     INTENT ONLY. Stage requirements, model
                                         assignments, permission scopes, and the
                                         DOCUMENTATION OUTPUT block.
  harness-build-plan-staged-prompts.md   INTENT ONLY. Superseded by the above.
  adaptive-frontend-harness-prompt.md    Historical architecture spec. Context only.
  run-stages.sh                          Driver script. You will rewire it at the end.

AUTHORITY ORDER — non-negotiable, applies to every decision this run:
  1. docs/CONTRACTS.md and docs/PUBLIC_API.md
  2. docs/STAGE_INPUTS.md
  3. recovery-reconciliation-stages.md
  4. everything else

The plan files were written BEFORE docs/CONTRACTS.md existed. They hardcode package names,
paths, type names, and function signatures that Stage 0 later designed differently. That
mismatch is the defect you are here to fix. Treat every identifier in a plan file as
unverified until you confirm it against CONTRACTS.md or PUBLIC_API.md. This applies to the
package names in run-stages.sh too.

═══ EXECUTE IN ORDER ═══

STEP 1 — Stage 2.5, Phase 1 (diagnosis, read-only)
  Follow Stage 2.5 Phase 1 from recovery-reconciliation-stages.md exactly.
  Produce docs/RECONCILIATION.md.
  Pay particular attention to 1(a): whether CONTRACTS.md §15 and PUBLIC_API.md agree with
  EACH OTHER. If they do not, that is a Stage 0 defect rather than a Stage 2 one — say so
  prominently, complete the diagnosis, and STOP. Do not proceed to Step 2. A Stage 0
  defect needs a human decision this prompt does not authorize.

STEP 2 — Stage 2.5, Phases 2 and 3 (decide and execute)
  Only if Step 1 found CONTRACTS and PUBLIC_API mutually consistent.
  Bias hard toward MIGRATE. AMEND requires demonstrated internal inconsistency and a new
  ADR. If migration is painful, migrate anyway and record the cost.
  Complete veto V001's baseline-comparison rule in budget evaluation now that REWARD.md is
  available. Keep the array-of-breaching-fields return shape — it was a correct deviation.
  Write docs/decisions/02-reconciliation.md.

STEP 3 — Stage 2.6 (regenerate downstream prompts)
  Follow Stage 2.6 from recovery-reconciliation-stages.md exactly.
  Emit prompts/stage-NN.md for every remaining stage in STAGE_INPUTS.md, plus
  prompts/STAGE_MAP.md.
  Every generated prompt embeds the AMENDED UNIVERSAL PREAMBLE verbatim and the
  DOCUMENTATION OUTPUT block from harness-stages-3-onward-revised.md.
  Use STAGE_INPUTS.md numbering, not the plan files' numbering.
  Run the validation pass: every identifier in every generated prompt must exist in
  CONTRACTS.md or PUBLIC_API.md. Report any that do not. There must be none.

STEP 4 — Rewire the driver
  Rewrite run-stages.sh so its STAGE_NAME, STAGE_MODEL, STAGE_SCOPE, and STAGE_VERIFY
  tables are derived entirely from prompts/STAGE_MAP.md. The @harness/* names currently in
  that script came from the same bad template and are unverified.
  Update the RENDERERS array to the adapters PUBLIC_API.md actually defines.
  Confirm every path referenced by every VERIFY command exists in the repo.

STEP 5 — Report and stop
  Emit BOOTSTRAP_REPORT.md containing:
    - What Step 1 diagnosed, in plain terms
    - Every remedy applied, and anything discarded as orphan
    - Whether CONTRACTS.md was amended, and if so, what downstream work that invalidates
    - The stage-number mapping between STAGE_INPUTS.md and the plan files
    - The full list of generated prompts with their model and write scope
    - Any INPUTS corrections made to STAGE_INPUTS.md, with reasoning
    - The exact next command to run
  Then STOP. Do not begin any build stage.

═══ CONSTRAINTS ═══

- Never write outside: packages/**, docs/**, prompts/**, run-stages.sh
- Never modify docs/adr/* or docs/decisions/* from prior stages. Those are history.
- If any step cannot complete as specified, emit BLOCKED: <reason> and stop. Do not
  improvise a workaround — improvising is what produced this situation.
- Do not carry any package name, path, or type name from a plan file into generated output
  without confirming it in CONTRACTS.md or PUBLIC_API.md first.
```

---

## After it stops

Read `BOOTSTRAP_REPORT.md`, and specifically check two things:

- **Was `CONTRACTS.md` amended?** If yes, read the new ADR and confirm you agree. An amendment invalidates some Stage 1 work, and the report should say which.
- **Did the Step 3 validation pass report zero unverified identifiers?** Any non-zero count means a generated prompt still carries the original defect.

Then the single command, from here to the end:

```bash
./run-stages.sh 3 5      # overnight batch — independent packages
```

Review, then the dependency chain:

```bash
./run-stages.sh 6 6      # attended — statistically silent failure modes
./run-stages.sh 7 10     # overnight
```

Stage numbers come from `prompts/STAGE_MAP.md`, not from the original plan files. Read the map before running.
