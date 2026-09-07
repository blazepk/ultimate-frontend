# RULES.md — Shared stage preamble

**Status: normative for every stage.** Referenced from each `prompts/stage-NN.md`
via its `requires` block. Do not embed a copy in a stage prompt; reference this
file instead.

This is the Universal Preamble with the SCOPE RULES block replaced by the
amended version issued during the Stage 2.5 recovery. The change is the second
bullet: a structural contradiction now halts execution instead of being worked
around. CONTEXT RULES and COMPLETION RULES are unchanged from the original.

---

## CONTEXT RULES

```
CONTEXT RULES
- Read only the files listed under INPUTS. Do not explore the repo beyond them.
- Everything in docs/CONTRACTS.md is FROZEN. Never modify it. Never work around it.
- If an input contradicts this prompt, the input wins. Report the contradiction.
```

## SCOPE RULES (amended — Stage 2.5 recovery)

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

## COMPLETION RULES

```
COMPLETION RULES
- Every file you create gets a colocated test.
- Run the VERIFY command. Do not report success until it passes.
- If VERIFY cannot pass, stop and emit: BLOCKED: <one-line reason>. Do not
  partially claim success, and do not weaken the test to make it pass.
- Final output: the file list you created, the VERIFY result, and any
  OPEN_QUESTIONS entries you added. Nothing else.
```

---

## Halt message formats

`CLAUDE.md` defines two specific forms of the halt message. Use the one that
matches the failure:

| Failure | Message |
|---------|---------|
| A referenced file does not exist | `BLOCKED: missing resource — <path>, required by <what>` |
| A referenced file contradicts `docs/CONTRACTS.md` | `BLOCKED: contradiction — <X> vs <Y> at <location>` |

Neither case permits authoring the missing file, proceeding without it, or
emitting a reconciled guess.
