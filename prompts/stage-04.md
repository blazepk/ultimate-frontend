---
stage: 4
name: build-pipeline
model: Sonnet 5
write_scope: packages/build/src/**
requires:
  - docs/RULES.md
  - docs/CONTRACTS.md#§7.5
  - docs/CONTRACTS.md#§9.2
  - docs/CONTRACTS.md#§15
  - docs/PUBLIC_API.md
  - packages/build/package.json
  - packages/build/tsconfig.json
  - packages/contracts/src/types.ts
  - packages/contracts/src/resolve.ts
  - packages/islands/src/registry.ts
  - packages/renderers/src/adapter.ts
  - packages/renderers/src/scheduler.ts
  - islands/registry.json
  - islands/contracts.json
  - site.config.json
  - fixtures/catalog.json
  - fixtures/dashboard.json
provides:
  - packages/build/src/build.ts
  - packages/build/src/build.test.ts
  - packages/build/src/index.ts
  - packages/build/tsconfig.json
  - packages/build/tsconfig.build.json
verify: pnpm --filter @harness/build typecheck && pnpm --filter @harness/build test && pnpm --filter @harness/build build
---

# Stage 4 — Build pipeline · Sonnet 5

Follow `docs/RULES.md`. Read only what is in `requires` above.

## Status

`packages/build/` currently has only a `package.json` and an empty
`index.ts` stub. This stage gives it real content under `src/`; delete the
stale root `index.ts` once `src/index.ts` exists.

`packages/build/tsconfig.json` also still carries the repo-skeleton pattern
(`"include": ["*.ts", "*.tsx"]`, root-level only — it will not match
anything under `src/`). Update it to `"include": ["src/**/*.ts"]` and
`"compilerOptions": { "noEmit": true }` (no `outDir`/`exclude`), matching
`packages/contracts/tsconfig.json`. Add a new
`packages/build/tsconfig.build.json` extending it, with
`"compilerOptions": { "noEmit": false, "outDir": "./dist", "declaration":
true }` and `"exclude": ["src/**/*.test.ts"]`. Update `package.json`'s
`"build"` script to `"tsc -p tsconfig.build.json"` if it isn't already.

`docs/PUBLIC_API.md` scopes `@harness/build` to CONTRACTS §9.2 exactly — an
esbuild-based static/server/client route builder producing a
`BuildManifest`. It is not an Astro integration, a Vite plugin, or a CLI;
that packaging (referred to as `@harness/astro` in an earlier, now-corrected
draft of `docs/PUBLIC_API.md`) is deferred and out of scope here.

## TASK

Implement `build()`: given a resolved `BuildProfile`, produce the `dist/`
output CONTRACTS §9.2 specifies for every route.

## OUTPUTS

### `packages/build/src/build.ts` + colocated test

```ts
function build(profile: BuildProfile, opts: { out_dir: string }): Promise<BuildManifest>;
```

Output layout under `opts.out_dir` (canonically `dist/<profile_id>/`):

```
manifest.json                      BuildManifest
static/<route_id>.html             for render_mode static and client routes
server/<route_id>.mjs              for EVERY route
assets/<route_id>.js               per-route client bundle (scheduler + adapters
                                   + island modules), present iff the route has
                                   ≥1 bootable island or render_mode = client
data/<route_id>.json               copy of the route's data file, present iff
                                   data_strategy ∈ { client, request }
```

`server/<route_id>.mjs` default-exports `render(data: JsonValue | null):
Promise<string>` returning the full shell HTML. Data handling: for
`data_strategy = "static"` bake build-time data into the module (`data`
param ignored); for `"request"` the caller passes parsed `data/` copy
contents per call; for `"none"`/`"client"` the caller passes `null`. For
`static` routes, pre-execute the module to emit `static/<route_id>.html`; for
`client` routes the static HTML contains empty wrappers.

`BuildManifest` (§9.2):

```ts
interface BuildManifest {
  schema_version: 1;
  profile_id: string;
  built_at: string;
  routes: {
    route_id: string;
    path: string;
    render_mode: RenderMode;
    html_file: string | null;   // null for "server"
    server_file: string;        // always present
    data_strategy: DataStrategy;
    js_files: { file: string; bytes: number }[];
    data_file: string | null;   // non-null iff data_strategy ∈ {client, request}
  }[];
}
```

Shell template and island wrapper markup are fixed (§7.5):

```html
<div data-island="<island_id>"
     data-contract="<contract_id>"
     data-renderer="<renderer>"
     data-hydration="<hydration>">…server-rendered inner HTML or empty…</div>
```

Wrappers appear in `islands` array order inside `<main>`:
`<!doctype html><html lang="en"><head><meta charset><meta viewport>
<title>{route.title}</title></head><body><main>…wrappers…</main>
<script type="module" src="…route bundle…"></script></body></html>`. Routes
with zero bootable islands omit the script tag.

Test: build the reference site's baseline profile (via
`makeBaselineProfile` + `resolve`, both already available from
`packages/contracts`). Assert manifest shape; wrapper attributes present in
emitted HTML; a `static` route's HTML contains server-rendered island inner
HTML; a `client` route's wrappers are empty.

### `packages/build/src/index.ts`

Barrel matching `docs/PUBLIC_API.md`'s `@harness/build` `"."` export
(`build`, `BuildManifest`).

## DOCUMENTATION OUTPUT (required)

Also produce `docs/decisions/04-build.md` using exactly this structure:

```
## What this stage built
Two to four sentences. What exists now that did not before, in terms a reader who has
not seen the code can follow.

## Decisions made during implementation
For each non-obvious choice, in this format:
  **Decision:** what was chosen
  **Alternatives rejected:** what else was viable, and specifically why not
  **Revisit when:** the concrete condition that would make this the wrong choice
Only include decisions where a competent engineer could reasonably have chosen otherwise.
Skip anything CONTRACTS.md already dictated — that is Stage 0's record, not yours.

## Load-bearing assumptions
What this code assumes to be true that is not enforced by the type system. For each,
state what breaks if it stops holding. Be specific: name the function and the failure.

## How to tell if this is still correct
The command to run, and what its output should look like. A future reader must be able
to check this stage's health without reading the implementation.

## Escalated
Anything appended to docs/OPEN_QUESTIONS.md, and the conservative reading chosen instead.
```

Write for someone reading in six months with no memory of this work.

## VERIFY

`pnpm --filter @harness/build typecheck && pnpm --filter @harness/build test && pnpm --filter @harness/build build`
