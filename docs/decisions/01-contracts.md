## What this stage built

`@harness/contracts` was left partially built by the Stage 2.5 recovery
(types, constraints, resolve, and a budget threshold check). This stage
completed its remaining CONTRACTS.md §5.4 obligations: a whole-config
validator (`validate()`) covering structural checks and the combination
constraint table together, build-profile construction
(`makeBaselineProfile`, `applyProposal`) with the `BuildProfile`/`Proposal`/
`Mutation` types they need, and the five reference fixture files
(`site.config.json`, `islands/contracts.json`, `fixtures/catalog.json`,
`fixtures/dashboard.json`, `kb/records.json`) that every later stage's tests
build on.

## Decisions made during implementation

**Decision:** C001/C002 are checked once per route (at the route's JSON
pointer, using route-level fields only); C003/C004 are checked once per
island (at the island's pointer, using the island's renderer/hydration plus
the route's render_mode/data_strategy). Two separate code paths, not one
shared loop.
**Alternatives rejected:** Looping over islands and calling the full
`checkConstraints` (all four predicates) for each one — this is what the
first draft did, and it duplicated C001/C002 once per island on a route,
which the B1/B2 test vectors (CONTRACTS Appendix B) caught immediately: they
expect exactly one `C001`/`C002` entry per route, not one per island. The
draft's own test suite failed against its own test vectors before this was
caught.
**Revisit when:** never, unless CONTRACTS §4.1 changes which fields C001/C002
depend on.

**Decision:** Invalid or unrecognized `renderer`/`hydration`/`render_mode`/
`data_strategy` values are absorbed silently by `validate()` (cast without
throwing) rather than raising an error.
**Alternatives rejected:** Throwing (mirroring `constraints.ts`'s
`checkConstraints`, which does throw on bad enum values) was considered, but
`validate()` operates on `unknown` and must collect-not-fail-fast per §5.3;
also, CONTRACTS' error-code table (§5.1, §5.2) has no code for "enum field
outside its closed union" on these four specific fields — S001 covers only
ID-shaped fields (`site_id`, `route_id`, `island_id`, `contract_id`). Silently
not matching any C-predicate for a garbage enum value is the correct,
code-table-consistent behavior: it simply isn't flagged as illegal by this
function, matching what the frozen error-code table actually specifies.
**Revisit when:** CONTRACTS.md adds an error code for this case.

**Decision:** Build-profile ID generation (`bp_<unix_ms>_<seq>`) uses a
plain module-scoped counter, reset on process restart.
**Alternatives rejected:** A globally-unique or crypto-random suffix was
considered, but CONTRACTS §1.1 specifies "a 4-digit zero-padded per-process
counter starting at `0000`" explicitly — that is the frozen spec, not a free
choice.
**Revisit when:** never; this is what the frozen ID format requires, listed
here only because a colleague might otherwise wonder why the counter isn't
more robust.

## Load-bearing assumptions

- **`validate()` assumes it is called before `resolve()`, `makeBaselineProfile()`,
  or `applyProposal()`** — none of the latter three re-validate their input.
  If a caller skips `validate()` and passes a structurally broken
  `SiteConfig`, `resolve()` will either throw an unrelated TypeError (e.g.
  `.map` on a non-array) or silently produce a nonsensical
  `ResolvedSiteConfig`. Nothing in this package enforces the ordering.
- **`applyProposal()` assumes `p.target_route_id` equals `p.mutation.route_id`**
  — CONTRACTS §10 states this as an invariant of `Proposal` itself ("equals
  mutation.route_id") but `applyProposal()` does not check it. If a caller
  constructs a `Proposal` where these disagree, `applyProposal()` uses
  `target_route_id` to find the route and applies the mutation there
  regardless of what `mutation.route_id` says — silently wrong if the two
  ever diverge.
- **`applyProposal()`'s C-code re-check assumes the mutation only ever
  changes fields it explicitly handles** (hydration, renderer, render_mode,
  data_strategy). If CONTRACTS.md ever adds a new `Mutation` kind, this
  function's `switch` needs a new case — an unhandled kind currently falls
  through silently (no `default` throws), so the mutation would be silently
  ignored rather than erroring. Name the function: `applyProposal`, the
  `switch (mutation.kind)` block.
- **The 240-tuple checksum test and the property test in `resolve.test.ts`
  both independently assume `checkConstraints`'s illegal count is exactly
  60** — if that ever changes (it shouldn't; CONTRACTS §4.2 freezes it), all
  three of `constraints.test.ts`, `resolve.test.ts`, and `validate.test.ts`
  need updating together, not just one.

## How to tell if this is still correct

Run `pnpm --filter @harness/contracts typecheck && pnpm --filter @harness/contracts test && pnpm --filter @harness/contracts build`
from the repo root. Expect: typecheck emits nothing (clean exit); test
reports `5 passed (5)` test files and `40 passed (40)` tests, with no
skipped or todo tests; build emits nothing (clean exit) and populates
`packages/contracts/dist/`. If `validate.test.ts`'s B1/B2/B4/B5 cases or the
240-tuple checksum ever fail, do not adjust the test — CONTRACTS.md Appendix
B and §4.2 are the frozen source of truth for what those numbers must be.

## Escalated

Nothing was appended to `docs/OPEN_QUESTIONS.md` by this stage. The two
entries this stage was closing out (originally #5 and #7 in
`docs/OPEN_QUESTIONS.md`, both already marked RESOLVED during the Stage 2.5
recovery, contingent on `validate()`/`makeBaselineProfile()`/`applyProposal()`
actually being built) are now fully closed — both functions exist, are
tested, and are exported from the package's public entry point.
