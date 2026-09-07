## What this stage built

`@harness/renderers` went from an empty stub to a complete renderer layer:
one `RendererAdapter` implementation for each of the four frozen renderers
(react, preact, svelte, vanilla), a client scheduler that boots islands per
their `Hydration` value and tracks `window.__HARNESS__` state, and three
reference components (`hero-cta`, `nav-menu`, `data-table`) implemented in
all four renderers — twelve component files in total, each exercised by a
real compiled/rendered pass, not a mock. `islands/registry.json` now maps
all twelve (contract, renderer) pairs to their modules.

## Decisions made during implementation

**Decision:** Preact's SSR rendering (`renderToString`) is a small custom
VNode-to-HTML-string function written for this package, not the
`preact-render-to-string` package.
**Alternatives rejected:** Using `preact-render-to-string` was the obvious
first choice, but it is not among this stage's permitted dependencies
(`STAGE_INPUTS.md`'s Stage 3 row lists only `react@18/react-dom@18/
preact@10/svelte@4` plus `jsdom`/`vite-plugin-svelte` as dev deps — Preact
itself does not bundle SSR). The custom renderer is scoped narrowly to what
the three reference components actually use (intrinsic elements, text,
function components, a handful of attributes) — it is not a general-purpose
Preact SSR implementation and should not be treated as one.
**Revisit when:** a future component needs a Preact feature this renderer
doesn't handle (fragments-as-arrays are supported; conditional rendering via
`null`/`false` is supported; portals, refs, and class components are not).

**Decision:** react/react-dom's TypeScript types are a small hand-written
ambient shim (`react-shims.d.ts`), not `@types/react`/`@types/react-dom`.
**Alternatives rejected:** `@types/react` is the standard real-world choice,
but React and ReactDOM ship no bundled types of their own and `@types/react`
is not among this stage's permitted dependencies. The shim declares only the
exact surface this package's `react.ts` adapter and `.tsx` components use
(`createElement`, `useState`, the `react-dom/server` and `react-dom/client`
entry points, and a permissive global `JSX.IntrinsicElements`) — it is
deliberately not a full React type surface.
**Revisit when:** `@types/react` is added to a future stage's permitted
dependencies, at which point the shim should be deleted in favor of it
(more complete, community-maintained, catches more real mistakes).

**Decision:** Svelte components are compiled at test-run time via
`svelte/compiler`'s `compile()` (once with `generate: "ssr"`, once with
`generate: "dom", hydratable: true`), writing output to
`packages/renderers/.svelte-tmp/` and dynamically importing it — rather than
registering `@sveltejs/vite-plugin-svelte` in a vitest config to import
`.svelte` files directly.
**Alternatives rejected:** Registering the Vite plugin is the standard
approach and is why it's a permitted dev dependency, but it typically
compiles for one target (matching the current build mode) at a time,
whereas testing both `renderToString` and `hydrate` for the same source
genuinely needs both an SSR-compiled and a DOM-compiled artifact
simultaneously — which is exactly how a real bundler pipeline (Stage 4's
esbuild-svelte, compiling the same source twice for `server.mjs` and the
client bundle) handles it too. Compiling directly via the compiler API gives
full, explicit control over both targets without fighting a single-target
plugin pipeline. `@sveltejs/vite-plugin-svelte` remains an installed
dependency per `STAGE_INPUTS.md`'s row, for whichever future stage (likely
Stage 4) wires up the real bundler.
**Revisit when:** if this pattern needs to scale beyond three tiny reference
components — the temp-file compile/import cycle adds real overhead per test
run and would not be the right approach for a large component library.

**Decision:** temp-compiled Svelte output files use `crypto.randomUUID()` in
their filename, not a simple incrementing counter.
**Alternatives rejected:** An incrementing counter was the first
implementation and caused a real, observed bug: vitest runs different test
files in separate worker processes, each with its own counter starting at
0, and all three contract test files write into the same shared
`.svelte-tmp/` directory — two workers' `svelte.ssr.0.mjs` (or `.dom.0.mjs`)
collided at the identical path, and whichever worker's write landed last
silently won, causing one contract's compiled component to be imported by a
different contract's test (caught immediately: `data-table`'s and
`hero-cta`'s renderToString tests received `nav-menu`'s markup). A random
UUID per compilation eliminates the collision regardless of parallelism.
**Revisit when:** never, barring a change to how vitest parallelizes test
files.

**Decision:** each component's own root element carries `role`/`aria-label`/
focusability (per CONTRACTS §6.2), not the outer `data-island` wrapper div
itself; events, however, are dispatched on the true outer wrapper via
`.closest("[data-island]")`.
**Alternatives rejected:** Putting a11y attributes on the true wrapper was
considered first (it's literally what §6.2's text says — "the rendered
island wrapper"), but the wrapper is templated by Stage 4's build process
from a fixed shell (§7.5) with no a11y slot, and a component's
`renderToString` return value is a plain string that cannot reach "outside
itself" to modify a parent element's attributes — there is no mechanism by
which a component could set attributes on the true wrapper during SSR.
Events don't have this problem because `hydrate`/`mount` (unlike
`renderToString`) receive a real DOM reference to the true wrapper, so
dispatching directly on it there is both correct and unambiguous. This
split is recorded in `docs/OPEN_QUESTIONS.md` #12 for Stage 5 (measurement)
to read correctly.
**Revisit when:** CONTRACTS.md is amended to specify how a11y attributes
reach the true wrapper (e.g., if Stage 4's shell template gains an a11y
slot sourced from the contract).

## Load-bearing assumptions

- **The scheduler assumes `BootSpecWithModule.module` is always populated
  correctly by its caller** — CONTRACTS §7.3 itself specifies no mechanism
  for this (see `docs/OPEN_QUESTIONS.md` #11), and nothing in this package
  validates that the module actually matches the spec's `contract_id` and
  `renderer`. A caller that mismatches them would produce silently wrong
  rendering with no error from anything in this package.
- **The vanilla adapter's `mount` assumes `attach()` can run safely on a
  container whose `innerHTML` it just set synchronously in the same tick** —
  reasonable for the plain event-listener wiring the three reference
  components do, but would break for a vanilla component needing to wait for
  something (e.g. an image load) before attaching.
- **The Svelte adapter assumes its caller passes an SSR-compiled module to
  `renderToString` and a DOM-compiled (and, for `hydrate`, `hydratable:
  true`-compiled) module to `hydrate`/`mount`** — nothing enforces this at
  the type level (`IslandModule` is `unknown`); passing the wrong compiled
  variant to the wrong method fails at runtime with an unhelpful error (as
  seen during this stage's own debugging: "`$$.fragment.l is not a
  function"` when a non-hydratable DOM build was used for `hydrate`).
- **The custom Preact SSR renderer assumes `props.children` is the only
  special prop needing exclusion from HTML attributes**, alongside `key`/
  `ref`/`on*` handlers — a component using some other Preact-specific prop
  convention this renderer doesn't know about would leak it into the
  attribute list.

## How to tell if this is still correct

Run `pnpm --filter @harness/renderers typecheck && pnpm --filter @harness/renderers test && pnpm --filter @harness/renderers build`
from the repo root. Expect: typecheck emits nothing; test reports
`5 passed (5)` test files and `37 passed (37)` tests (4 adapter-registry
tests, 9 scheduler tests covering all five `Hydration` values plus error/
timeout paths, and 8 tests per reference component × 3 components); build
emits nothing and populates `packages/renderers/dist/`. Also re-run
`pnpm --filter @harness/contracts test` and `pnpm --filter @harness/islands test`
— both should be unaffected (`40/40` and `17/17` respectively).

## Escalated

Two entries appended to `docs/OPEN_QUESTIONS.md` (#11, #12), both
genuine gaps in CONTRACTS.md itself rather than ambiguities this stage could
fully resolve alone: the missing module-reference mechanism in
`IslandBootSpec` (§7.3), and the missing mechanism for a11y attributes to
reach the true `data-island` wrapper from server-rendered HTML (§6.2 vs
§7.5). Both were given conservative, additive, non-breaking readings and
flagged explicitly for the stages (4 and 5) whose own work depends on
knowing the answer.
