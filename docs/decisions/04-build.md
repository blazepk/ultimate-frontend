## What this stage built

`@harness/build` went from an empty stub to a real esbuild-based route
builder: given a resolved `BuildProfile`, `build()` now produces the full
`dist/<profile_id>/` layout CONTRACTS §9.2 specifies for every route —
a bundled `server/<route_id>.mjs` for every route, `static/<route_id>.html`
for static and client routes (server-rendered island HTML for the former,
empty wrappers for the latter), a per-route `assets/<route_id>.js` client
bundle for any route with a bootable island or `render_mode = "client"`,
a copied `data/<route_id>.json` where the strategy calls for one, and a
`manifest.json` describing all of it.

## Decisions made during implementation

**Decision:** Both `server/<route_id>.mjs` and `assets/<route_id>.js` are
fully self-contained esbuild bundles — including `@harness/contracts`,
`@harness/islands`, and `@harness/renderers` source bundled directly in, not
left as external `import`s resolved by Node/the browser at runtime.
**Alternatives rejected:** Marking the `@harness/*` workspace packages as
esbuild externals looks cleaner and is the more common pattern for a
monorepo, but doesn't actually work here: those packages' `package.json`
`exports` maps point at `.ts`/`.tsx` source (per `docs/PUBLIC_API.md`, e.g.
`"." → "./src/index.ts"`), and plain Node — which is what will execute
`server/<route_id>.mjs` in Stage 5's `serve()` — cannot import a raw `.ts`
file without a loader. Bundling everything in produces a genuinely portable
output file that runs under plain Node (server) or in a plain browser
(client), matching what "esbuild-based" route builder implies in
`docs/PUBLIC_API.md`.
**Revisit when:** the `@harness/*` packages gain a real compiled `.js`
output that's what their `exports` maps point to (rather than source) — at
that point externalizing them would shrink every bundle considerably.

**Decision:** the vanilla `IslandModule`'s `{ render, attach }` shape is
produced by a namespace import (`import * as Island0 from "..."`), not a
default import.
**Alternatives rejected:** A default import was the first attempt (matching
react/preact/svelte, whose modules genuinely have default exports) and
failed immediately with a real esbuild error — vanilla components (Stage
3's `vanilla.ts` files) export `render`/`attach` as named exports, matching
CONTRACTS §7.1's literal shape description `{ render(props): string;
attach(el, props): void }`, which is exactly what a namespace import
produces. Renderer-specific import styles are necessary, not a shortcut.
**Revisit when:** never, unless a future stage changes the vanilla
component export convention (it shouldn't — it's what CONTRACTS specifies).

**Decision:** the SSR/DOM Svelte compilation split from Stage 3
(`generate: "ssr"` for the server bundle, `generate: "dom", hydratable:
true` for the client bundle) is reproduced here via `esbuild-svelte`'s
`compilerOptions`, applied uniformly to the whole bundle per build call —
not per-file.
**Alternatives rejected:** A per-component compile mode was considered
(matching Stage 3's test-only `svelte-compile.ts` helper, which compiles one
file at a time with an explicit target), but a real bundler builds one
route's entire dependency graph in a single pass; esbuild-svelte's plugin
API applies one `generate` mode to everything the bundle touches, which is
the correct level for a genuine build (a route's server bundle is entirely
SSR-shaped; its client bundle is entirely DOM-shaped — there's no mixing
within one bundle).
**Revisit when:** a route ever needs both SSR and DOM Svelte output from the
*same* bundle (not expected — server and client bundles are always separate
files here).

## Load-bearing assumptions

- **`build()` reads `islands/contracts.json` and `islands/registry.json`
  from fixed, repo-root-relative paths computed from its own module
  location** (`packages/build/src/build.ts`'s `__dirname` walked up three
  levels), not from parameters — because `build(profile, opts)`'s signature
  is frozen by CONTRACTS §9.2 with no room for them. If `packages/build/src/`
  is ever relocated within the repo, this breaks silently (wrong path, file
  read throws) rather than through a type error.
- **The generated client bundle's data-reading code assumes
  `window.__ROUTE_DATA__` is populated by the same HTML page that loads it**
  — for `data_strategy = "request"`, this means whatever serves the page
  (Stage 5) must populate that inline script tag with the real per-request
  value, not the value baked in at build time. This is the open item
  recorded in `docs/OPEN_QUESTIONS.md` #13; nothing in this package enforces
  it or would notice if a future Stage 5 forgets.
- **Temp entry files for esbuild are written to
  `packages/build/.build-tmp/` (inside the package tree) and deleted at the
  end of every `build()` call** — a crash mid-build (an unhandled throw
  between `bundleToFile` calls) would leave orphaned entry files behind
  rather than guaranteeing cleanup via a `finally`. Low risk (a single failed
  build leaves a few small `.ts` files, not corrupted output) but worth
  naming.
- **`build()` assumes every island's `contract_id` exists in
  `islands/contracts.json` and every `(contract_id, renderer)` pair exists
  in `islands/registry.json`** — it throws immediately if not (`contractOf`,
  `findModulePath`), rather than collecting errors the way
  `@harness/contracts`'s `validate()` does. This is intentional: by the time
  `build()` runs, the config should already have passed `validate()` +
  `validateWithContracts()` + `validateRegistry()` (Stages 1/2); a throw here
  signals those checks were skipped, not a normal, expected failure mode.

## How to tell if this is still correct

Run `pnpm --filter @harness/build typecheck && pnpm --filter @harness/build test && pnpm --filter @harness/build build`
from the repo root. Expect: typecheck emits nothing; test reports
`1 passed (1)` test file and `7 passed (7)` tests (manifest shape, all three
route render modes' HTML/server-file behavior, per-route asset emission,
data-file copying); build emits nothing. The test builds the actual
reference site end-to-end (real esbuild bundling, real Svelte compilation,
real file writes to a temp directory) — a passing run is reasonably strong
evidence the whole pipeline works, not just that individual functions
typecheck.

## Escalated

One entry appended to `docs/OPEN_QUESTIONS.md` (#13): CONTRACTS §7.5's fixed
shell has no documented mechanism for `"static"`/`"request"`-strategy data to
reach the client bundle. Given the conservative reading implemented (an
inline `window.__ROUTE_DATA__` script tag, additive to the fixed shell, not
altering anything it does specify), and flagged explicitly for Stage 5,
which must populate that same tag with real per-request data for
`"request"`-strategy routes or the client will silently use stale data.
