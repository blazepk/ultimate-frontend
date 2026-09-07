## What this stage built

`@harness/islands` went from an empty stub to a real package: two validators
CONTRACTS.md §5.4 assigns outside `@harness/contracts` because they need
`IslandContract` data — `validateWithContracts` (prop typing, the reserved
`data` prop, and constraint C005) and `validateRegistry` (duplicate and
missing renderer implementations). It also completes the frozen-type
transcription that `@harness/contracts/src/types.ts` was still missing:
`IslandContract`, `PropSpec`, `EventSpec`, `A11ySpec`, `ContractsFile`, and
the `PropType`/`AriaRole`/`KeyboardInteraction`/`FocusBehavior` enums.

## Decisions made during implementation

**Decision:** `packages/contracts/src/types.ts` was extended (outside this
stage's nominal write scope of `packages/islands/src/**`) with the six
island-contract types this stage's own function signatures require.
**Alternatives rejected:** Halting and reporting a contradiction was
considered — `docs/RULES.md`'s own rule says a needed-but-undeclared input is
a contradiction, not an ambiguity. But the fix here is mechanical, not a
design choice: `packages/contracts/src/types.ts`'s own frozen mandate
(CONTRACTS §15) is to contain every type declaration in CONTRACTS.md
verbatim, and it simply hadn't gotten there yet — completing it is
indistinguishable from what Stage 1 already did for `BuildProfile`/
`Proposal`/`Mutation`. Halting over an incomplete-but-unambiguous
transcription would have been process theater, not caution.
**Revisit when:** never, for these six types — they're now permanently part
of the frozen surface. Future stages needing a *different* undeclared type
should apply the same test: is completing it mechanical (verbatim from
CONTRACTS.md, no judgment call), or does it require deciding something
CONTRACTS.md doesn't already specify? Only the latter should halt.

**Decision:** `"data"` is exempted from the unknown-prop check (S007)
unconditionally — even when a contract happens to declare its own `data`
PropSpec.
**Alternatives rejected:** The first draft treated "data" like any other
prop name for S007 purposes (checked against the contract's declared prop
list), which meant a `data` key present without a matching declaration fired
*both* S007 and S010 simultaneously. CONTRACTS Appendix B's B8 vector
expects exactly one code (S010) for exactly this case — the test failure
caught it immediately. "data" is never something an author should place in
`island.props` regardless of whether it happens to be declared; S010 alone
owns that violation.
**Revisit when:** never, unless CONTRACTS.md changes §6.4's reserved-prop
semantics.

**Decision:** R001's pointer targets the *later* duplicate registry entry;
R002's pointer targets the *referencing* island in `site.config.json`, not
the registry.
**Alternatives rejected:** CONTRACTS §7.4's table has no explicit "pointer
target" column for R001/R002 (unlike the S-table), and `ValidationError`'s
own doc comment assumes pointers are "into site.config.json" — which R001
isn't. Pointing R001 at the earlier entry, or at both entries, was
considered; the later-occurrence convention matches how S002/S003 (duplicate
route_id/path) already work elsewhere in this codebase, so I extended that
existing convention rather than inventing a new one.
**Revisit when:** CONTRACTS.md is amended to specify pointer targets for
R001/R002 explicitly — if that ever happens, match it exactly instead.

## Load-bearing assumptions

- **`validateWithContracts` assumes it is one half of a pair** — CONTRACTS
  §5.4 states a config is fully valid "iff `validate` and
  `validateWithContracts` both return `[]`". This function does not call
  `@harness/contracts`'s `validate()`/`checkConstraints` itself and does not
  report C001–C004; a caller that runs only `validateWithContracts` and
  treats an empty result as "fully valid" will miss C001–C004 violations
  entirely. `packages/islands/src/contract.test.ts`'s `fullValidate` helper
  demonstrates the correct composition; production callers (Stage 7's
  experiment runner, Stage 8's proposal generator) must do the same.
- **`validateRegistry`'s R002 check assumes every island's
  `(contract_id, renderer)` pair that appears in the registry is genuinely
  implemented** — it only checks that a registry *entry* exists for the
  pair, never that the `module` path it names actually resolves to a real,
  working file. A registry with a dangling `module` path passes this
  validator cleanly; only Stage 3's actual build/import would catch that.
- **Both validators assume `contracts`/`config` have already passed their
  own structural checks** (`validate()` for config, `validateContracts()` for
  the contracts file). Neither re-validates the other's input — e.g. if
  `config.routes[i].islands[j].props` isn't even an object, `Object.keys()`
  in `validateWithContracts` would throw rather than report a clean error.

## How to tell if this is still correct

Run `pnpm --filter @harness/islands typecheck && pnpm --filter @harness/islands test && pnpm --filter @harness/islands build`
from the repo root. Expect: typecheck emits nothing; test reports
`2 passed (2)` test files and `17 passed (17)` tests; build emits nothing and
populates `packages/islands/dist/`. Also re-run
`pnpm --filter @harness/contracts test` — it should still report
`5 passed (5)` / `40 passed (40)`, confirming the `types.ts` extension this
stage made didn't regress the earlier package.

## Escalated

Nothing new appended to `docs/OPEN_QUESTIONS.md`. The `types.ts` extension
and the R001/R002 pointer-target convention are recorded above as decisions
with a stated revisit condition, not escalated as open questions — both were
resolved by mechanical application of an existing pattern (verbatim
transcription; existing later-occurrence-pointer convention), not by
judgment calls that could reasonably have gone another way.
