## What this stage built

`@harness/measure` went from an empty stub to the local serving and
measurement layer: `serve()`, a plain-Node HTTP server that reproduces a
production route's behavior locally from nothing but `manifest.json`
(static files, per-request server execution, client assets, and the
`data_strategy = "client"` data endpoint); and `collectSample`/`collectMany`,
which drive headless Chromium through the full CONTRACTS §11.2 procedure
and assemble a `MeasurementSample` — real navigation timing, real
Performance Observer data, real reads of the scheduler's own
`window.__HARNESS__` state, and a real accessibility check against the
island's contract.

## Decisions made during implementation

**Decision:** `serve()` is a hand-rolled `node:http` server, not a
third-party HTTP framework.
**Alternatives rejected:** Express or a similar framework would be the
default real-world choice, but this stage's only permitted new dependency
is `playwright` (`STAGE_INPUTS.md`'s Stage 5 row) — a framework was never on
the table. The actual routing need is small (four request shapes: data
endpoint, assets, server-executed route, static file) and a plain
`http.createServer` handles it without strain.
**Revisit when:** never, unless the routing surface grows enough that
hand-rolled dispatch becomes its own maintenance burden.

**Decision:** the accessibility check (`countA11yViolations`) looks for
`role`/`aria-label`/focusability on the `data-island` wrapper's **first
element child**, exactly matching the convention `docs/OPEN_QUESTIONS.md`
#12 (Stage 3) recorded — not the wrapper `<div>` itself.
**Alternatives rejected:** Checking the literal wrapper (which is what
CONTRACTS §6.2's text names) was not viable — Stage 3 already established,
and this stage's own passing tests confirm, that the wrapper is templated
by Stage 4 with no a11y slot, so role/aria-label can only ever land on the
component's own root element. This stage inherits that reading rather than
re-litigating it, since the two stages must agree on where to look.
**Revisit when:** a future CONTRACTS.md revision gives the wrapper itself an
a11y slot — at that point both this check and Stage 3's components would
need to move together.

**Decision:** `hydration_failures` counts any island whose status is not
exactly `"ready"` at collection time (`"pending"`, `"scheduled"`, or
`"error"`), rather than only counting `"error"` and separately reasoning
about the 10-second hydration timeout.
**Alternatives rejected:** An earlier draft tried to special-case "still
scheduled but timeout hasn't technically elapsed yet" as not-a-failure, but
CONTRACTS §11.1 states the count directly: "islands in status 'error' or
not 'ready' at collection time." Since `SETTLE_MS` (3000ms) is shorter than
`HYDRATION_TIMEOUT_MS` (10000ms), a slow-but-not-yet-timed-out island is
still counted as a failure at collection time under the frozen wording —
the earlier draft's special case contradicted the spec it was trying to
honor.
**Revisit when:** never; this is a literal reading of frozen text, not a
judgment call.

## Load-bearing assumptions

- **The reference site is currently healthy, so this stage's own test suite
  never exercises a genuinely nonzero `flags` value** (all `hydration_failures`,
  `runtime_errors`, and `a11y_violations` are 0 across every route in
  `collect.test.ts`). The *mechanism* for detecting each is real and
  exercised (real Playwright navigation, real `__HARNESS__` reads, a real
  DOM a11y check), but a regression that broke, say, violation-counting
  itself (an off-by-one, a wrong selector) could plausibly still show "0"
  by coincidence on this particular fixture. A future stage adding a
  deliberately-broken fixture would strengthen this.
- **`collectSample`/`collectMany` each launch and close their own Playwright
  browser process** — `collectMany` reuses one browser across its `n`
  samples (fresh *context* per sample, per CONTRACTS §11.2), but a caller
  invoking `collectSample` `N_PER_ARM` (91) times in a loop instead of using
  `collectMany` would launch 91 separate browser processes. Stage 7
  (experiment runner) should use `collectMany`, not repeated `collectSample`
  calls, for real experiment volume.
- **The a11y check's "focusable descendant" test is a fixed CSS selector
  list** (`a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])`)
  — a reference (or future) component using some other natively-focusable
  element this list doesn't name (e.g. `<summary>`, a custom element with
  `tabindex`) would be flagged as a false violation.

## How to tell if this is still correct

Run `npx playwright install chromium && pnpm --filter @harness/measure typecheck && pnpm --filter @harness/measure test && pnpm --filter @harness/measure build`
from the repo root. Expect: typecheck emits nothing; test reports
`2 passed (2)` test files and `8 passed (8)` tests (`serve.test.ts`'s 6
cases run in under 2 seconds; `collect.test.ts`'s 2 cases run real Chromium
and take roughly 20 seconds — that duration is itself a rough health signal,
since Playwright startup dominates it and a large regression would show up
as a large duration increase); build emits nothing. Also re-run
`pnpm --filter @harness/build test` (7/7) and the earlier three packages'
suites (`contracts` 40/40, `islands` 17/17, `renderers` 37/37) — all should
be unaffected.

## Escalated

One prior open item, `docs/OPEN_QUESTIONS.md` #13 (Stage 4's inline
`window.__ROUTE_DATA__` mechanism for `"static"`/`"request"`-strategy
client data), is now marked RESOLVED — `serve.ts` reads the route's data
file fresh per request for `"request"`-strategy routes and passes it
through, verified end-to-end by this stage's own `serve.test.ts`. No new
entries were added; this stage's own genuine bug (documented above, the
`generateServerEntry`'s "client" branch omitting the script tag entirely —
caught by a debug script, not by the originally-written tests, since the
first draft of `collect.test.ts`'s "zero flags" assertion only reported *that*
something was wrong, not *what*) was a defect in Stage 4's code, fixed in
`packages/build/src/build.ts` directly rather than escalated, since it was
an unambiguous bug against Stage 4's own already-settled design, not a new
ambiguity.
