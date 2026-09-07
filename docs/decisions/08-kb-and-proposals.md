## What this stage built

`@harness/kb` went from an empty stub to the harness's memory and its
decision-making front end: a JSON-file store for knowledge-base records, the
strict-total-order precedence function that resolves conflicting evidence to
exactly one winner, the ingest rule that turns a finished experiment into a
new record (retiring whatever it supersedes), and the deterministic six-step
generator that reads scan measurements plus accumulated evidence and emits
the next `Proposal` to test. This is the last of the eight stages, and it
closes the loop: everything the harness learns flows back through here into
what it tries next.

## Decisions made during implementation

**Decision:** the supersede rule retires only records with the *same source*
(`measured`), leaving an identically-scoped `seeded` record active.
**Alternatives rejected:** Superseding every identically-scoped active
record regardless of source is the simpler reading of "any existing active
record with an identical scope". But CONTRACTS §13.4 says "identical scope
… **and same source**", and the behavior it produces is better: `precedes`
step 1 already ranks measured above seeded unconditionally, so a live
measured record always wins the query anyway. Retiring the seeded record
would destroy the fallback evidence for no gain — and would leave nothing
behind if the measured record is later superseded by a `neutral` result.
**Revisit when:** seeded records are ever produced in volume (nothing writes
them today), at which point their lifecycle deserves its own rule rather
than riding on the measured one's.

**Decision:** routes with no scan samples are **skipped** during target
selection rather than treated as score 0 (worst).
**Alternatives rejected:** Treating an unscanned route as maximally bad
would make the generator prioritize whatever it has never measured, which
sounds like useful exploration but is really optimizing blind — the
subsequent experiment would compare a baseline and variant of a route whose
current performance is unknown, and the KB would record the delta as
evidence about a route nobody has characterized. CONTRACTS §14 step 1 says
to compute a mean "over its scan samples"; with none there is no mean, so
skipping is the literal reading as well as the safer one.
**Revisit when:** an explicit exploration policy is added — "measure the
unmeasured" is a legitimate strategy, but it belongs in a stated rule, not
as a side effect of a missing-data default.

**Decision:** step 3's legality filter calls `validate()` and
`validateWithContracts()` on a mutated copy and inspects the returned codes,
rather than re-deriving the constraint predicates locally.
**Alternatives rejected:** Checking the four C-predicates inline would avoid
a deep clone and two full validation passes per candidate (the generator runs
this for every candidate on the target route). It was rejected because a
second implementation of the constraint table is exactly the drift risk the
whole frozen-contract structure exists to prevent — `prompts/stage-08.md`
calls this out explicitly. The clone-and-validate cost is trivial at this
scale (tens of candidates, all in memory).
**Revisit when:** candidate counts grow enough that per-candidate validation
shows up in a profile — the fix would be to hoist the invariant parts of
validation, not to duplicate the predicates.

**Decision:** step 3 also checks the two `set_data_strategy` rules
(from-`"none"` always dropped; to-`"none"` only when no island requires
`data`) explicitly, even though `validate()`/`validateWithContracts()`
already catch both as S011 and S013 respectively.
**Alternatives rejected:** Relying purely on the validators is less code and
provably equivalent today. The explicit checks were kept because CONTRACTS
§14 step 3 states both rules directly, and a reader comparing the code
against the spec should find them rather than having to derive that S011
covers the first case. The redundancy is deliberate and commented as such.
**Revisit when:** the two ever disagree — that would mean either the
validators or §14 changed, and the explicit check is what would surface it.

**Decision:** `applies()` is exported alongside `specificity`/`precedes`/
`query`, though `docs/PUBLIC_API.md` lists only the latter three.
**Alternatives rejected:** Keeping `applies` module-private matches the
documented export list exactly. It is exported because the islandless-query
semantics (§14 step 4: "a scope with non-null island fields does not apply")
are subtle enough to deserve direct testing, and testing it through `query`
alone would conflate scope matching with precedence ranking. This is an
addition to the documented surface, which `docs/PUBLIC_API.md`'s own
"anything not listed above is internal" clause permits.
**Revisit when:** the exports map is next revised — `applies` should either
be listed or moved behind a test-only entry point.

## Load-bearing assumptions

- **`precedes` is a strict total order only because `kb_id`s are distinct.**
  Level 5 (lexicographically greater `kb_id`) is what guarantees `query`
  returns exactly one winner; every earlier level can tie. `kb_id`s come from
  `generateId`, a `Date.now()` + per-process counter. **Failure mode:** two
  records sharing a `kb_id` (two runner processes in the same millisecond, or
  a hand-edited `kb/records.json`) make `precedes(a,b)` and `precedes(b,a)`
  both false, so `query`'s winner becomes dependent on array order and the
  generator stops being deterministic — silently, with no error. The
  order-independence test in `precedence.test.ts` would not catch it, because
  it uses distinct ids.

- **`created_at` comparison assumes fixed-width ISO-8601 UTC strings.** Level
  4 compares timestamps with `>` on raw strings, which equals chronological
  order only for the `YYYY-MM-DDTHH:mm:ss.sssZ` form CONTRACTS §1.2 mandates.
  **Failure mode:** a record written with a different format (an offset like
  `+05:30`, or millisecond-less `Z`) sorts lexicographically in the wrong
  place, quietly inverting recency. Nothing validates the format on load.

- **`ingest` mutates the caller's `KBFile` in place and does not persist.**
  CONTRACTS §13.5 specifies exactly this, so the caller must call `saveKB`
  itself. **Failure mode:** a caller that ingests and forgets to save loses
  the record and, worse, loses the *supersede* — the in-memory copy has the
  old record retired while the file still shows it active, so the next
  `loadKB` resurrects it alongside its replacement and both are active at
  once, which `precedes` will silently resolve by sample size or recency
  rather than reporting a conflict.

- **The generator assumes the scan samples it receives are all from the
  baseline profile and the `"scan"` arm.** `propose` filters `scan` by
  `route_id` only — it never checks `arm` or `profile_id`. **Failure mode:**
  passing a mixed set (e.g. leftover `"variant"` samples from an experiment)
  silently shifts the computed mean reward for that route and can retarget
  the whole proposal at the wrong route, with no signal.

- **Ranking stability depends on `Array.prototype.sort` being stable.** Step
  5 sorts "improves" candidates by `reward_delta` descending and relies on
  ties preserving enumeration order. Stability is guaranteed by ES2019 and by
  Node 20. **Failure mode:** on a hypothetical non-stable engine, two
  candidates with equal `reward_delta` could swap between runs, breaking the
  determinism the generator's contract promises — the determinism test uses
  an empty KB and so would not catch it.

- **`structuredClone` is assumed to faithfully copy a `ResolvedSiteConfig`.**
  `applyMutationToCopy` clones the whole site per candidate. This holds
  because the config is plain JSON data. **Failure mode:** if a future
  `RouteConfig` field ever holds something `structuredClone` cannot carry (a
  function, a class instance), the clone throws or silently drops it and the
  legality check runs against a subtly different site than the real one.

## How to tell if this is still correct

Run `pnpm --filter @harness/kb typecheck && pnpm --filter @harness/kb test && pnpm --filter @harness/kb build`
from the repo root. Expect: typecheck emits nothing; test reports
`4 passed (4)` test files and `58 passed (58)` tests in about a second; build
emits nothing.

The assertions that matter most are the ones pinning *determinism* and
*legality*, because both fail silently rather than loudly. `generate.test.ts`
asserts that the unfiltered winner on the reference site is exactly
`set_hydration nav → "idle"` — a specific, brittle-on-purpose expectation
that breaks if enumeration order, canonical enum order, or the legality
filter drifts. It also asserts the generator never proposes `hydration:
"none"` for any reference contract (all three declare events, so C005 must
block it on every route). If that one ever passes a `"none"`, the legality
filter has stopped calling the real validators.

## Escalated

Nothing new was appended to `docs/OPEN_QUESTIONS.md` by this stage — no
ambiguity in CONTRACTS §13 or §14 required a conservative reading beyond the
two documented above (unscanned-route skipping and same-source superseding),
both of which follow the frozen text's literal wording and are recorded here
as decisions rather than open questions.

`KBDirection`, `KBSource`, `KBStatus`, `KBScope`, `KBClaim`, `KBRecord`, and
`KBFile` were added to `packages/contracts/src/types.ts` as mechanical
completion of that file's own frozen mandate (CONTRACTS §15: "contains,
verbatim, every type/interface declaration in this document") — the same
pattern Stages 2, 5, and 6 followed and documented, not a design decision.
