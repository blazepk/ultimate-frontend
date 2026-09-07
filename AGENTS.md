# Harness build — index

This repo is built in stages. You execute ONE stage per session.

## Authority order — never violate
1. `docs/CONTRACTS.md`      frozen. Types, constraints, layout.
2. `docs/PUBLIC_API.md`     RECONCILED (see docs/decisions/02-reconciliation.md).
                            Layout ratified by ADR-0013; still amend it rather
                            than CONTRACTS.md if a future divergence is found.
3. `docs/STAGE_INPUTS.md`   which files each stage may read.
4. `prompts/stage-NN.md`    the stage instruction itself.
5. `files/*.md`             historical plans. INTENT ONLY. Never a source of
                            package names, paths, types, or signatures.

## How to execute
1. Read `docs/RULES.md`. Always. It is the shared preamble.
2. Read `prompts/stage-NN.md` for the stage you were asked to run.
3. Read exactly what that file's REQUIRES block lists. Nothing else.
4. Run its VERIFY. Report. Stop.

## Resource resolution
- `docs/CONTRACTS.md#§N` means read ONLY section N. Use `docs/INDEX-CONTRACTS.md`
  to find its line range. Do not load the whole file.
- A referenced file that does not exist is a 404. Emit
  `BLOCKED: missing resource — <path>, required by <what>` and stop.
  Do not author the missing file. Do not proceed without it.
- A referenced file that contradicts `docs/CONTRACTS.md` is a conflict. Emit
  `BLOCKED: contradiction — <X> vs <Y> at <location>` and stop.

## Never
- Read `files/*.md` for any identifier. Intent only.
- Read a stage prompt other than the one you were asked to run.
- Write outside the write scope declared in your stage's REQUIRES block.
- Modify `docs/CONTRACTS.md`, `docs/adr/*`, or `docs/decisions/*`.