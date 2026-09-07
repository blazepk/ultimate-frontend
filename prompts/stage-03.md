---
stage: 3
name: renderers-adapters-scheduler-components
model: Sonnet 5
write_scope: packages/renderers/src/**, islands/registry.json
requires:
  - docs/RULES.md
  - docs/CONTRACTS.md#§2
  - docs/CONTRACTS.md#§6.1
  - docs/CONTRACTS.md#§6.2
  - docs/CONTRACTS.md#§7.1
  - docs/CONTRACTS.md#§7.2
  - docs/CONTRACTS.md#§7.3
  - docs/CONTRACTS.md#§7.5
  - docs/CONTRACTS.md#§7.6
  - docs/CONTRACTS.md#Appendix-A.1
  - docs/PUBLIC_API.md
  - packages/renderers/package.json
  - packages/renderers/tsconfig.json
  - packages/contracts/src/types.ts
  - packages/islands/src/contract.ts
  - islands/contracts.json
provides:
  - packages/renderers/src/adapter.ts
  - packages/renderers/src/adapter.test.ts
  - packages/renderers/src/react.ts
  - packages/renderers/src/preact.ts
  - packages/renderers/src/svelte.ts
  - packages/renderers/src/vanilla.ts
  - packages/renderers/src/scheduler.ts
  - packages/renderers/src/scheduler.test.ts
  - packages/renderers/src/components/hero-cta/{react.tsx,preact.tsx,svelte.svelte,vanilla.ts}
  - packages/renderers/src/components/nav-menu/{react.tsx,preact.tsx,svelte.svelte,vanilla.ts}
  - packages/renderers/src/components/data-table/{react.tsx,preact.tsx,svelte.svelte,vanilla.ts}
  - packages/renderers/src/index.ts
  - packages/renderers/tsconfig.json
  - packages/renderers/tsconfig.build.json
  - islands/registry.json
verify: pnpm --filter @harness/renderers typecheck && pnpm --filter @harness/renderers test && pnpm --filter @harness/renderers build
---

# Stage 3 — Renderer adapters, scheduler, reference components · Sonnet 5

Follow `docs/RULES.md`. Read only what is in `requires` above.

## Status

`packages/renderers/` currently has only a `package.json` and an empty
`index.ts` stub. This stage gives it real content under `src/`; delete the
stale root `index.ts` once `src/index.ts` exists.

`packages/renderers/tsconfig.json` also still carries the repo-skeleton
pattern (`"include": ["*.ts", "*.tsx"]`, root-level only — it will not match
anything under `src/`, including the `.tsx`/`.svelte` component files this
stage writes). Update it to `"include": ["src/**/*.ts", "src/**/*.tsx"]` and
`"compilerOptions": { "noEmit": true }` (no `outDir`/`exclude`), matching
`packages/contracts/tsconfig.json`. Add a new
`packages/renderers/tsconfig.build.json` extending it, with
`"compilerOptions": { "noEmit": false, "outDir": "./dist", "declaration":
true }` and `"exclude": ["src/**/*.test.ts"]`. Update `package.json`'s
`"build"` script to `"tsc -p tsconfig.build.json"` if it isn't already.
`.svelte` files are handled by the Svelte adapter's own tooling, not `tsc`
directly — do not add `.svelte` to the `tsc` include pattern.

The renderer union is exactly four members — CONTRACTS §2:
`"react" | "preact" | "svelte" | "vanilla"`. There is no fifth. Do not
implement anything for any other framework.

## TASK

Implement one `RendererAdapter` per renderer, the client scheduler, and the
four reference-contract components (from `islands/contracts.json`, Appendix
A.1: `hero-cta`, `nav-menu`, `data-table` — three contracts, but note the
task lists three component directories, not four; there are exactly three
reference contracts) in all four renderers. Also write `islands/registry.json`
mapping every (contract, renderer) pair to its module.

## OUTPUTS

### `packages/renderers/src/adapter.ts` + colocated test

CONTRACTS §7.1:

```ts
interface RendererAdapter {
  renderer: Renderer;
  renderToString(module: IslandModule, props: Record<string, JsonValue>): Promise<string>;
  hydrate(container: Element, module: IslandModule, props: Record<string, JsonValue>): Promise<void>;
  mount(container: Element, module: IslandModule, props: Record<string, JsonValue>): Promise<void>;
}
type IslandModule = unknown;
```

Adapters must be pure with respect to props: same props → same HTML (no
randomness, no time reads during render). Include an adapter lookup by
`Renderer` (a `Record<Renderer, RendererAdapter>` or equivalent).

### `packages/renderers/src/{react,preact,svelte,vanilla}.ts`

One `RendererAdapter` implementation each. Svelte 4 server render is
`Component.render(props).html`. Every implementation must satisfy §6.2's
runtime obligations identically for every reference contract: wrapper
`role`, accessible name (`aria-label`), focusable element when `keyboard` is
non-empty, `tabindex="0"` when `focus = "self"`, tab-cycling when
`focus = "trap"`. Events are DOM `CustomEvent`s on the wrapper, `detail` =
the declared payload (absent for `"void"`), type = the declared event name.

### `packages/renderers/src/scheduler.ts` + colocated test

CONTRACTS §7.3, §7.6:

```ts
interface IslandBootSpec {
  island_id: string;
  contract_id: string;
  renderer: Renderer;
  hydration: Hydration;      // "none" islands never included
  mode: "hydrate" | "mount"; // mount when route render_mode = "client"
  props: Record<string, JsonValue>;  // static props; `data` NOT included
  needs_data: boolean;       // true iff contract declares a `data` prop
}

function initHarness(specs: IslandBootSpec[], opts: {
  data_strategy: DataStrategy;
  data_inline: JsonValue | null;  // non-null iff strategy static/request
  data_path: string | null;       // non-null iff strategy client
}): void;
```

Locates each island's wrapper by `data-island` attribute, schedules per the
`Hydration` semantics (§2: `none` never boots; `load` immediately;
`idle` first `requestIdleCallback`, 200ms fallback timeout;
`visible` first viewport intersection; `interaction` first `pointerdown` or
`focusin` inside the wrapper), resolves data (inline value, or fetch of
`data_path` for `client`), injects `data` into props where `needs_data`,
calls the adapter's `hydrate` or `mount`.

Maintains `window.__HARNESS__` (§7.6):

```ts
interface HarnessRuntimeState {
  islands: Record<string, {
    status: "pending" | "scheduled" | "ready" | "error";
    triggered_at: number | null;
    ready_at: number | null;
  }>;
  error_count: number;
}
```

`status` reaches `ready` when the adapter promise resolves, `error` if it
rejects or `HYDRATION_TIMEOUT_MS` (10000, CONTRACTS §1.4) elapses after
`triggered_at`. Tests must cover all five `Hydration` values and every
`__HARNESS__` state transition.

### `packages/renderers/src/components/<contract_id>/`

For each of the three reference contracts in `islands/contracts.json`
(`hero-cta`, `nav-menu`, `data-table`), one implementation per renderer:
`react.tsx`, `preact.tsx`, `svelte.svelte`, `vanilla.ts`. Preact files use
`/** @jsxImportSource preact */` per file (CONTRACTS/STAGE_INPUTS toolchain
note). Tests: for each (contract, renderer) pair, `renderToString` output is
deterministic, and after `hydrate` in jsdom the wrapper satisfies §6.2 items
1–2 (role + accessible name).

### `islands/registry.json`

CONTRACTS §7.2 `RegistryFile`: 3 contracts × 4 renderers = 12 entries, each
`{ contract_id, renderer, module }` with `module` a repo-relative path to the
implementation you just wrote.

### `packages/renderers/src/index.ts`

Barrel matching `docs/PUBLIC_API.md`'s `@harness/renderers` `"."` export
(adapter registry, detection). Per-renderer subpath exports (`"./react"`,
`"./preact"`, `"./svelte"`, `"./vanilla"`) are declared in `package.json`'s
`exports` map, pointing at the files above — do not add a `package.json`
edit outside this stage's write scope; if the existing `package.json` lacks
these subpath exports, that is a gap to flag in `docs/OPEN_QUESTIONS.md`, not
a license to edit files outside `packages/renderers/src/**`.

## DOCUMENTATION OUTPUT (required)

Also produce `docs/decisions/03-renderers.md` using exactly this structure:

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

`pnpm --filter @harness/renderers typecheck && pnpm --filter @harness/renderers test && pnpm --filter @harness/renderers build`
