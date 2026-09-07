# CONTRACTS.md — Frozen Interface Surface

**Status: FROZEN.** Version 1. No downstream stage may modify this file or work
around it. A change to this file is a new major version of the entire system and
invalidates every downstream artifact.

Everything in this document is normative. Downstream stages implement exactly
what is written here. Where this document names a default, the default is
normative. Where this document is silent, the behavior is whatever is simplest
and is NOT load-bearing (no other stage may depend on it).

Companion frozen documents: `docs/REWARD.md` (reward, vetoes, tiers, sample
size), `docs/STAGE_INPUTS.md` (stage permissions). ADRs in `docs/adr/` record
rationale only; they are not normative.

---

## 1. Conventions and constants

### 1.1 Identifiers

- Authored IDs (`site_id`, `route_id`, `island_id`, `contract_id`):
  must match `^[a-z0-9][a-z0-9-]{0,63}$`.
- Generated IDs use the form `<prefix>_<unix_ms>_<seq>` where `<unix_ms>` is
  13 decimal digits (Unix epoch milliseconds at creation) and `<seq>` is a
  4-digit zero-padded per-process counter starting at `0000`.

| Entity            | Prefix | Regex                        |
|-------------------|--------|------------------------------|
| BuildProfile      | `bp`   | `^bp_[0-9]{13}_[0-9]{4}$`    |
| Proposal          | `pr`   | `^pr_[0-9]{13}_[0-9]{4}$`    |
| ExperimentResult  | `ex`   | `^ex_[0-9]{13}_[0-9]{4}$`    |
| MeasurementSample | `sm`   | `^sm_[0-9]{13}_[0-9]{4}$`    |
| KBRecord          | `kb`   | `^kb_[0-9]{13}_[0-9]{4}$`    |

### 1.2 Timestamps

All timestamps are ISO 8601 UTC with milliseconds: `YYYY-MM-DDTHH:mm:ss.sssZ`.
This format is fixed-length; lexicographic comparison equals chronological
comparison, and the KB precedence function (§13.5) relies on that.

### 1.3 JSON values

```ts
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
```

All persisted artifacts are UTF-8 JSON files without BOM, `\n` line endings.

### 1.4 Frozen constants

| Constant               | Value  | Meaning                                             |
|------------------------|--------|-----------------------------------------------------|
| `SCHEMA_VERSION`       | `1`    | Version stamped on all persisted artifacts          |
| `N_PER_ARM`            | `91`   | Samples per experiment arm (derived in REWARD.md §6)|
| `SCAN_SAMPLES`         | `20`   | Samples per route for a baseline scan               |
| `SETTLE_MS`            | `3000` | Quiet period before metric collection               |
| `HYDRATION_TIMEOUT_MS` | `10000`| An island not `ready` by then is a hydration failure|
| `FLAKE_TOLERANCE`      | `1`    | Failure vetoes fire at ≥ 2 affected samples (§ REWARD.md §5) |
| `VIEWPORT_W × VIEWPORT_H` | `1366 × 768` | Measurement viewport, DPR 1              |
| `CPU_THROTTLE`         | `4`    | Chromium CPU throttling multiplier during sampling  |
| `SERVE_PORT_BASE`      | `4600` | First port tried by the measurement server          |
| `DATA_PATH_PREFIX`     | `/__data/` | URL prefix serving route data JSON              |

### 1.5 Rounding

Persisted floating-point results (normalized scores, rewards, deltas, z) are
rounded half-up to 4 decimal places at persistence time only; all intermediate
arithmetic uses full double precision.

---

## 2. Closed vocabularies

Every union below is closed. Adding a member is a contract change.

```ts
type Renderer     = "react" | "preact" | "svelte" | "vanilla";

type Hydration    = "none" | "load" | "idle" | "visible" | "interaction";

type RenderMode   = "static" | "server" | "client";

type DataStrategy = "none" | "static" | "request" | "client";

type Tier         = "critical" | "standard" | "deferred";

type MetricName   =
  | "lcp_ms" | "cls" | "tbt_ms" | "ttfb_ms"
  | "js_bytes" | "html_bytes" | "hydration_ms";

type Arm          = "baseline" | "variant" | "scan";

type Verdict      = "accept" | "reject" | "veto" | "inconclusive";

type VetoCode     = "V001" | "V002" | "V003" | "V004" | "V005";

type ProposalStatus =
  | "pending" | "testing"
  | "accepted" | "rejected" | "vetoed" | "inconclusive";

type KBDirection  = "improves" | "regresses" | "neutral";
type KBSource     = "measured" | "seeded";
type KBStatus     = "active" | "superseded";

type PropType     = "string" | "number" | "boolean"
                  | "string[]" | "number[]" | "json";

type AriaRole     = "button" | "link" | "navigation" | "region"
                  | "dialog" | "list" | "form" | "img" | "none";

type KeyboardInteraction = "activate" | "dismiss" | "navigate";

type FocusBehavior = "none" | "self" | "trap";
```

**Canonical `MetricName` order** (used wherever metrics are iterated or arrays
are ordered): `lcp_ms, cls, tbt_ms, ttfb_ms, js_bytes, html_bytes,
hydration_ms`.

**Canonical enum value order** for mutation enumeration (§14): the declaration
order shown above (e.g. `Hydration`: `none, load, idle, visible, interaction`).

Semantics:

- `RenderMode` — how the route **shell** HTML is produced. `static`: at build
  time. `server`: per request. `client`: shell served as an empty scaffold and
  the page is composed in the browser.
- `Hydration` — when an island's client JS boots. `none`: never (server/static
  HTML only). `load`: immediately on page load. `idle`: first
  `requestIdleCallback` (fallback: 200 ms timeout). `visible`: first
  intersection with the viewport. `interaction`: first `pointerdown` or
  `focusin` inside the island wrapper.
- `DataStrategy` — when the route's data file (§3.2 `data_url`) is resolved.
  `none`: route has no data. `static`: read at build time and inlined.
  `request`: read by the server per request. `client`: fetched by the browser
  from `DATA_PATH_PREFIX + route_id + ".json"`.

---

## 3. Core configuration types

### 3.1 SiteConfig

Persisted at `site.config.json` (repo root).

```ts
interface SiteConfig {
  schema_version: 1;
  site_id: string;          // authored-ID regex (§1.1)
  routes: RouteConfig[];    // length ≥ 1
}
```

### 3.2 RouteConfig

```ts
interface RouteConfig {
  route_id: string;             // authored-ID regex; unique across the site
  path: string;                 // see path grammar below; unique across the site
  title: string;                // 1..80 characters
  tier?: Tier;                  // DEFAULT: "standard"
  render_mode: RenderMode;
  data_strategy: DataStrategy;
  data_url: string | null;      // required: null iff data_strategy === "none";
                                // otherwise a repo-relative JSON path, see below
  budgets?: Partial<RouteBudgets>; // DEFAULT: {} — missing keys filled from
                                   // the tier default table (§8.2)
  islands: IslandConfig[];      // may be empty; island_id unique within route
}
```

Path grammar: `"/"` or one-or-more segments, each `[a-z0-9-]+` or `:[a-z0-9_]+`:
`^\/$|^(\/([a-z0-9-]+|:[a-z0-9_]+))+$`.

`data_url` grammar (when non-null): `^\.\/[a-z0-9_\-\/.]+\.json$` — a path
relative to the repo root, starting with `./`, pointing at a JSON file. No
network URLs; all strategies read the same file, differing only in when and
where (§2 semantics). This keeps experiment arms comparable.

### 3.3 IslandConfig

```ts
interface IslandConfig {
  island_id: string;                 // authored-ID regex; unique within route
  contract_id: string;               // must exist in islands/contracts.json
  renderer: Renderer;
  hydration: Hydration;
  props: Record<string, JsonValue>;  // static props; may be {}; must satisfy
                                     // the island's contract (§6.3); must NOT
                                     // contain the reserved key "data" (§6.4)
}
```

### 3.4 Resolved types

`validate` + `resolve` (§5.4) turn a `SiteConfig` into a fully-defaulted form.
Resolved types have no optional fields; everything downstream of Stage 1
consumes resolved types only.

```ts
interface ResolvedRouteConfig extends RouteConfig {
  tier: Tier;                // filled
  budgets: RouteBudgets;     // fully filled from tier defaults + overrides
}

interface ResolvedSiteConfig {
  schema_version: 1;
  site_id: string;
  routes: ResolvedRouteConfig[];
}
```

---

## 4. Placement tuple and constraint table

The **placement tuple** of an island is:

```
(renderer, hydration, render_mode, data_strategy)
 island     island     route        route
```

`renderer` and `hydration` come from the `IslandConfig`; `render_mode` and
`data_strategy` come from the containing `RouteConfig`. `data_strategy` is
route-scoped only (ADR-0002).

Tuple space: 4 × 5 × 3 × 4 = **240** combinations.

### 4.1 Combination constraints (the deny list)

A combination is **illegal iff at least one predicate below matches**. The
predicates are independent (set semantics, not first-match); a validator
reports every matching code. Any tuple matching no predicate is legal. This
list is exhaustive — there are no other illegal combinations.

| Code   | Name                       | Predicate                                        | Reason |
|--------|----------------------------|--------------------------------------------------|--------|
| `C001` | `STATIC_SHELL_REQUEST_DATA`| `render_mode = static ∧ data_strategy = request` | A static shell is immutable at request time; there is no per-request server render to consume request-time data. |
| `C002` | `CLIENT_SHELL_REQUEST_DATA`| `render_mode = client ∧ data_strategy = request` | A client shell is served as a static asset; no server render pass exists to resolve request-time data. |
| `C003` | `CLIENT_SHELL_DEAD_ISLAND` | `render_mode = client ∧ hydration = none`        | In client mode there is no server-produced island HTML; an island that never boots JS never renders anything. |
| `C004` | `UNHYDRATED_CLIENT_DATA`   | `hydration = none ∧ data_strategy = client`      | Client-fetched data resolves in the browser; an island with no client JS can never receive it. Applies even if the island's props are constant (ADR-0002 records the deliberate over-strictness). |

`C001`/`C002` involve only route fields and are reported once per route at the
route's JSON pointer. `C003`/`C004` involve island fields and are reported per
island at the island's JSON pointer.

### 4.2 Checksum (normative test vector)

Counting distinct illegal tuples over the 240-tuple space:
|C001| = 20, |C002| = 20, |C003| = 16, |C004| = 12,
|C002 ∩ C003| = 4, |C003 ∩ C004| = 4, all other intersections empty.

**Illegal tuples: 60. Legal tuples: 180.** A Stage-1 test MUST enumerate all
240 tuples and assert exactly these counts.

### 4.3 Capability constraint (contract-dependent)

| Code   | Name                    | Predicate                                                        |
|--------|-------------------------|------------------------------------------------------------------|
| `C005` | `EVENTS_REQUIRE_JS`     | island's contract declares ≥ 1 event ∧ `hydration = none`        |

`C005` is not part of the 240-tuple space (it depends on the island contract)
and is checked by `validateWithContracts` (§5.4), not `validate`.

---

## 5. Validation

### 5.1 ValidationError

```ts
interface ValidationError {
  code: ErrorCode;
  pointer: string;   // RFC 6901 JSON pointer into site.config.json,
                     // e.g. "/routes/2/islands/0"
  message: string;   // human-readable; NOT machine-parsed; content free
}

type ErrorCode =
  // combination constraints (§4)
  | "C001" | "C002" | "C003" | "C004" | "C005"
  // structural constraints (§5.2)
  | "S001" | "S002" | "S003" | "S004" | "S005" | "S006" | "S007" | "S008"
  | "S009" | "S010" | "S011" | "S012" | "S013" | "S014" | "S015" | "S016"
  | "S017" | "S018"
  // registry constraints (§7.4)
  | "R001" | "R002";
```

### 5.2 Structural error codes

| Code   | Name                        | Predicate                                                                 | Pointer target |
|--------|-----------------------------|---------------------------------------------------------------------------|----------------|
| `S001` | `ID_FORMAT`                 | any ID field fails its regex (§1.1)                                       | the field |
| `S002` | `DUPLICATE_ROUTE_ID`        | `route_id` seen earlier in `routes`                                       | the later route |
| `S003` | `DUPLICATE_PATH`            | `path` seen earlier in `routes`                                           | the later route |
| `S004` | `INVALID_PATH`              | `path` fails the path grammar (§3.2)                                      | the field |
| `S005` | `DUPLICATE_ISLAND_ID`       | `island_id` seen earlier within the same route                            | the later island |
| `S006` | `UNKNOWN_CONTRACT`          | `contract_id` not present in loaded contracts                             | the field |
| `S007` | `UNKNOWN_PROP`              | key in `island.props` not declared by the contract                        | the island |
| `S008` | `MISSING_REQUIRED_PROP`     | contract prop with `required: true` (except `data`, §6.4) absent from `island.props` | the island |
| `S009` | `PROP_TYPE_MISMATCH`        | `island.props` value fails the declared `PropType` (§6.3 type check)      | the island |
| `S010` | `RESERVED_DATA_PROP`        | `island.props` contains key `"data"`                                      | the island |
| `S011` | `DATA_URL_MISSING`          | `data_strategy ≠ none ∧ data_url = null`                                  | the route |
| `S012` | `DATA_URL_FORBIDDEN`        | `data_strategy = none ∧ data_url ≠ null`                                  | the route |
| `S013` | `DATA_PROP_REQUIRES_DATA`   | island's contract declares prop `data` with `required: true` ∧ route `data_strategy = none` | the island |
| `S014` | `BUDGET_NOT_POSITIVE`       | any provided budget value ≤ 0                                             | the field |
| `S015` | `EMPTY_ROUTES`              | `routes.length = 0`                                                       | `/routes` |
| `S016` | `UNSUPPORTED_SCHEMA_VERSION`| `schema_version ≠ 1`                                                      | the field |
| `S017` | `TITLE_LENGTH`              | `title` empty or > 80 characters                                          | the field |
| `S018` | `DATA_URL_FORMAT`           | non-null `data_url` fails the grammar (§3.2)                              | the field |

### 5.3 Collection and ordering

Validators **collect all** errors (no fail-fast) and return them sorted by
(pointer, code) ascending, both lexicographic. Structural type errors that make
traversal impossible (config is not an object, `routes` is not an array) are
reported as `S016`/`S015` respectively and terminate traversal of that subtree
only.

### 5.4 Module surface (Stage 1 / Stage 2)

```ts
// Stage 1 — src/contracts/validate.ts
// Checks: S001–S005, S011, S012, S014–S018, C001–C004. No contracts needed.
function validate(config: unknown): ValidationError[];   // [] means valid

// Stage 1 — src/contracts/resolve.ts
// Precondition: validate(config) returned []. Fills tier and budgets defaults.
function resolve(config: SiteConfig): ResolvedSiteConfig;

// Stage 1 — src/contracts/resolve.ts
function makeBaselineProfile(site: ResolvedSiteConfig): BuildProfile;
function applyProposal(site: ResolvedSiteConfig, p: Proposal): BuildProfile;
// applyProposal re-runs combination checks on the mutated route and THROWS
// an Error whose message begins with the violated code if any C-code matches.

// Stage 2 — src/islands/contract.ts
// Checks: S006–S010, S013, C005. Requires loaded contracts.
function validateWithContracts(
  config: SiteConfig,
  contracts: IslandContract[],
): ValidationError[];

// Stage 2 — src/islands/contract.ts
// Structural validity of the contracts file itself (see §6.5).
function validateContracts(contracts: unknown): ValidationError[];
```

A config is **fully valid** iff `validate` and `validateWithContracts` both
return `[]` and the registry check (§7.4) returns `[]`.

---

## 6. Island capability contract

An island contract declares what a component does, independent of any renderer.
Every renderer implementation of a contract must satisfy it identically.

### 6.1 Types

```ts
interface IslandContract {
  contract_id: string;      // authored-ID regex; unique in contracts file
  props: PropSpec[];        // may be empty; names unique
  events: EventSpec[];      // may be empty; names unique
  a11y: A11ySpec;
}

interface PropSpec {
  name: string;             // ^[a-z][a-z0-9_]{0,31}$
  type: PropType;
  required: boolean;
  default: JsonValue | null; // MUST be null when required = true;
                             // when required = false this value (possibly null)
                             // is injected if the prop is absent
}

interface EventSpec {
  name: string;             // ^[a-z][a-z0-9_]{0,31}$
  payload: PropType | "void";
}

interface A11ySpec {
  role: AriaRole;           // "none" = no role requirement on the wrapper
  label:
    | { source: "static"; value: string }        // 1..80 chars
    | { source: "prop"; prop: string };          // must name a required string prop
  keyboard: KeyboardInteraction[];  // may be empty; members unique
  focus: FocusBehavior;
}
```

### 6.2 Runtime obligations (checked by measurement, § REWARD.md V002)

For every island whose contract's `a11y.role ≠ "none"`, the rendered island
wrapper (§7.5) must, once the island reaches its final rendered state:

1. carry `role="<a11y.role>"` on the wrapper element;
2. have a non-empty accessible name: `aria-label` equal to the static label
   value, or to the string value of the named prop;
3. if `keyboard` is non-empty: contain at least one focusable element
   (tabindex ≥ 0 or natively focusable);
4. if `focus = "self"`: the wrapper has `tabindex="0"`. If `focus = "trap"`:
   while the island is in its open/active state, Tab cycles within it.

Events are emitted as DOM `CustomEvent` on the island wrapper, with
`detail` = the declared payload (or absent for `"void"`), event type equal to
the declared name. Any renderer implementation must emit them identically.

### 6.3 Prop type checking

A `JsonValue` v satisfies a `PropType` as follows — `"string"`: typeof string;
`"number"`: typeof number and finite; `"boolean"`: typeof boolean;
`"string[]"`: array, every element a string; `"number[]"`: array, every element
a finite number; `"json"`: any `JsonValue`.

### 6.4 The reserved `data` prop

A contract may declare a prop named `data` (any type, normally `"json"`). This
prop is never authored in `IslandConfig.props` (`S010`). At render/hydration
time the harness injects the route's resolved data object into it. If the
route's `data_strategy` is `"none"`, islands whose contract requires `data`
are illegal on that route (`S013`). Under `data_strategy = "client"`, injection
happens after the client fetch completes, which is why `hydration = none` is
illegal there (`C004`).

### 6.5 Contracts file

`islands/contracts.json`:

```ts
interface ContractsFile {
  schema_version: 1;
  contracts: IslandContract[];
}
```

`validateContracts` reports (reusing codes): `S016` bad schema_version, `S001`
bad `contract_id`/prop/event name format, `S005` duplicate contract_id / prop
name / event name (pointer disambiguates), `S009` a `default` value that fails
its own declared type or a non-null default on a required prop, `S017` label
static value length violation, `S008` `label.source = "prop"` naming a prop
that is not a required string prop.

---

## 7. Renderer adapter, scheduler, and runtime contracts

### 7.1 RendererAdapter

Each renderer ships one adapter (Stage 3):

```ts
interface RendererAdapter {
  renderer: Renderer;
  // Server/build render of one island to HTML (inner HTML of the wrapper).
  renderToString(module: IslandModule, props: Record<string, JsonValue>): Promise<string>;
  // Attach behavior to existing server-rendered DOM inside `container`.
  hydrate(container: Element, module: IslandModule, props: Record<string, JsonValue>): Promise<void>;
  // Client-render from scratch into an empty `container` (client shells).
  mount(container: Element, module: IslandModule, props: Record<string, JsonValue>): Promise<void>;
}

// The default export of a component module (§15 layout). Its concrete shape is
// renderer-private: a React/Preact component function, a Svelte component
// class, or (vanilla) an object { render(props): string; attach(el, props): void }.
type IslandModule = unknown;
```

Adapters must be pure with respect to props: same props → same HTML (no
randomness, no time reads during render).

### 7.2 Implementation registry

`islands/registry.json` (written in Stage 3):

```ts
interface RegistryFile {
  schema_version: 1;
  implementations: IslandImplementation[];
}

interface IslandImplementation {
  contract_id: string;
  renderer: Renderer;
  module: string;   // repo-relative path, e.g. "./src/components/nav-menu/preact.tsx"
}
```

### 7.3 IslandBootSpec and scheduler

```ts
interface IslandBootSpec {
  island_id: string;
  contract_id: string;
  renderer: Renderer;
  hydration: Hydration;      // "none" islands are never included in boot specs
  mode: "hydrate" | "mount"; // mount when route render_mode = "client"
  props: Record<string, JsonValue>;  // static props; `data` NOT included
  needs_data: boolean;       // true iff contract declares a `data` prop
}

// Stage 3 — src/renderers/scheduler.ts (bundled into every page with islands)
function initHarness(specs: IslandBootSpec[], opts: {
  data_strategy: DataStrategy;
  data_inline: JsonValue | null;  // non-null iff strategy static/request
  data_path: string | null;       // non-null iff strategy client
}): void;
```

The scheduler locates each island's wrapper by `data-island` attribute,
schedules per the `Hydration` semantics (§2), resolves data (inline value, or
fetch of `data_path` for `client`), injects `data` into props where
`needs_data`, and calls the adapter's `hydrate` or `mount`.

### 7.4 Registry checks

| Code   | Name                       | Predicate |
|--------|----------------------------|-----------|
| `R001` | `DUPLICATE_IMPLEMENTATION` | two entries share (`contract_id`, `renderer`) |
| `R002` | `MISSING_IMPLEMENTATION`   | some island in the (resolved) config uses (`contract_id`, `renderer`) with no registry entry |

```ts
// Stage 2 — src/islands/registry.ts
function validateRegistry(
  registry: unknown,
  config: SiteConfig,
  contracts: IslandContract[],
): ValidationError[];   // R001, R002, plus S016/S001/S006 structural reuse
```

### 7.5 Island wrapper (HTML contract)

Every island is emitted (at build or server render) as:

```html
<div data-island="<island_id>"
     data-contract="<contract_id>"
     data-renderer="<renderer>"
     data-hydration="<hydration>">…server-rendered inner HTML or empty…</div>
```

Wrappers appear in `islands` array order inside `<main>` of the shell. The
shell template is fixed: `<!doctype html><html lang="en"><head><meta charset>
<meta viewport><title>{route.title}</title></head><body><main>…wrappers…
</main><script type="module" src="…route bundle…"></script></body></html>`.
Routes with zero bootable islands omit the script tag.

### 7.6 Client runtime state (measurement contract)

The scheduler maintains `window.__HARNESS__`:

```ts
interface HarnessRuntimeState {
  islands: Record<string, {                    // key: island_id
    status: "pending" | "scheduled" | "ready" | "error";
    triggered_at: number | null;  // performance.now() when boot started
    ready_at: number | null;      // performance.now() when hydrate/mount resolved
  }>;
  error_count: number;  // window uncaught errors + unhandled rejections since load
}
```

`status` reaches `ready` when the adapter promise resolves, `error` if it
rejects or `HYDRATION_TIMEOUT_MS` elapses after `triggered_at`.

---

## 8. Per-route budgets

### 8.1 Schema

```ts
interface RouteBudgets {
  lcp_ms: number;        // > 0
  cls: number;           // > 0
  tbt_ms: number;        // > 0
  ttfb_ms: number;       // > 0
  js_bytes: number;      // > 0, integer
  html_bytes: number;    // > 0, integer
  hydration_ms: number;  // > 0
}
```

A budget is the maximum acceptable per-arm **mean** (across an experiment
arm's samples) for that metric on that route. Budget enforcement is veto
`V001` (REWARD.md §5); budgets are not enforced at build time.

### 8.2 Default values by tier (canonical table)

Merge rule: `resolved.budgets = { ...TIER_DEFAULTS[tier], ...route.budgets }`
(key-by-key; a provided key wins; missing keys come from the tier).

| Metric        | `critical` | `standard` | `deferred` |
|---------------|-----------:|-----------:|-----------:|
| `lcp_ms`      | 1800       | 2500       | 4000       |
| `cls`         | 0.10       | 0.10       | 0.25       |
| `tbt_ms`      | 200        | 300        | 600        |
| `ttfb_ms`     | 500        | 800        | 1800       |
| `js_bytes`    | 153600     | 256000     | 512000     |
| `html_bytes`  | 102400     | 153600     | 204800     |
| `hydration_ms`| 200        | 300        | 500        |

REWARD.md §4 restates this table; both files are frozen together and must stay
byte-identical in content.

---

## 9. BuildProfile, build outputs

### 9.1 BuildProfile

```ts
interface BuildProfile {
  schema_version: 1;
  profile_id: string;                       // bp_… (§1.1)
  site_id: string;
  created_at: string;                       // §1.2
  source:
    | { kind: "baseline" }
    | { kind: "proposal"; proposal_id: string };
  routes: ResolvedRouteConfig[];            // ALL routes, fully resolved
}
```

`makeBaselineProfile` copies the resolved site unchanged. `applyProposal`
copies it, applies the proposal's single mutation (§10) to the target route,
and re-checks combination constraints (§5.4). Data-strategy normalization:
a `set_data_strategy` mutation with value `"none"` also sets the route's
`data_url` to `null`; a `set_data_strategy` mutation on a route whose current
strategy is `"none"` THROWS (no data file exists to serve the new strategy —
the generator never emits this, §14 step 3).

### 9.2 Build outputs (Stage 4)

```ts
// Stage 4 — src/build/build.ts
function build(profile: BuildProfile, opts: { out_dir: string }): Promise<BuildManifest>;
```

Output layout under `opts.out_dir` (canonically `dist/<profile_id>/`):

```
manifest.json                      BuildManifest
static/<route_id>.html             for render_mode static and client routes
server/<route_id>.mjs              for EVERY route (see below)
assets/<route_id>.js               per-route client bundle (scheduler + adapters
                                   + island modules), present iff the route has
                                   ≥1 bootable island or render_mode = client
data/<route_id>.json               copy of the route's data file, present iff
                                   data_strategy ∈ { client, request }
```

`server/<route_id>.mjs` default-exports
`render(data: JsonValue | null): Promise<string>` returning the full shell
HTML. Data handling: for `data_strategy = "static"` the builder bakes the
build-time data into the module (the `data` parameter is ignored); for
`"request"` the caller passes the parsed contents of the route's `data/` copy
per call; for `"none"` and `"client"` the caller passes `null`. For `static`
routes the builder pre-executes the module to emit `static/<route_id>.html`.
For `client` routes the static HTML contains empty wrappers.

```ts
interface BuildManifest {
  schema_version: 1;
  profile_id: string;
  built_at: string;
  routes: {
    route_id: string;
    path: string;
    render_mode: RenderMode;
    html_file: string | null;   // repo-relative within out_dir; null for "server"
    server_file: string;        // always present
    data_strategy: DataStrategy;  // copied so the server needs no config
    js_files: { file: string; bytes: number }[];  // emitted client assets
    data_file: string | null;   // non-null iff data_strategy ∈ {client, request}
  }[];
}
```

---

## 10. Proposal

```ts
type Mutation =
  | { kind: "set_hydration";     route_id: string; island_id: string; value: Hydration }
  | { kind: "set_renderer";      route_id: string; island_id: string; value: Renderer }
  | { kind: "set_render_mode";   route_id: string; value: RenderMode }
  | { kind: "set_data_strategy"; route_id: string; value: DataStrategy };

interface Proposal {
  schema_version: 1;
  proposal_id: string;            // pr_…
  created_at: string;
  target_route_id: string;        // equals mutation.route_id
  mutation: Mutation;             // exactly ONE mutation per proposal (ADR-0009)
  rationale_kb_ids: string[];     // KB records that motivated it; may be []
  status: ProposalStatus;
}
```

Status machine: `pending → testing → (accepted | rejected | vetoed |
inconclusive)`, mapped 1:1 from the experiment `Verdict`. Terminal states have
no transitions. Persisted at `runs/proposals/<proposal_id>.json`.

---

## 11. MeasurementSample and measurement procedure

### 11.1 Types

```ts
interface MetricValues {
  lcp_ms: number;        // ≥ 0
  cls: number;           // ≥ 0
  tbt_ms: number;        // ≥ 0
  ttfb_ms: number;       // ≥ 0
  js_bytes: number;      // ≥ 0, integer
  html_bytes: number;    // ≥ 0, integer
  hydration_ms: number;  // ≥ 0
}

interface SampleFlags {
  hydration_failures: number;  // islands in status "error" or not "ready" at collection
  runtime_errors: number;      // __HARNESS__.error_count at collection
  a11y_violations: number;     // count of §6.2 check failures; MEASURED ONLY on
                               // run_index 0, fixed at 0 on other runs
}

interface MeasurementSample {
  schema_version: 1;
  sample_id: string;           // sm_…
  profile_id: string;
  route_id: string;
  arm: Arm;
  run_index: number;           // 0-based within (profile_id, route_id, arm)
  collected_at: string;
  metrics: MetricValues;
  flags: SampleFlags;
}
```

### 11.2 Procedure (normative for Stage 5)

Environment: headless Chromium via Playwright; viewport `VIEWPORT_W ×
VIEWPORT_H`, DPR 1; CPU throttling `CPU_THROTTLE`×; network unthrottled
(localhost); a **fresh browser context per sample** with cache disabled.

Per sample: navigate to the route URL → wait for the `load` event → wait for
network idle (no requests in flight for 500 ms) → wait `SETTLE_MS` → collect.

Metric capture:

| Metric         | Definition |
|----------------|------------|
| `ttfb_ms`      | navigation entry `responseStart − requestStart` |
| `lcp_ms`       | `startTime` of the **last** `largest-contentful-paint` performance entry |
| `cls`          | sum of `layout-shift` entry values with `hadRecentInput = false` |
| `tbt_ms`       | Σ `max(0, duration − 50)` over all `longtask` entries |
| `js_bytes`     | Σ `encodedBodySize` of resource entries whose name ends `.js` or `.mjs` |
| `html_bytes`   | navigation entry `encodedBodySize` |
| `hydration_ms` | Σ (`ready_at − triggered_at`) over `__HARNESS__` islands with status `ready` |

Performance observers must be installed before navigation (via an init
script) with `buffered: true`.

### 11.3 Module surface (Stage 5)

```ts
// src/measure/serve.ts
function serve(dist_dir: string, opts: { port: number }): Promise<{
  base_url: string;
  close(): Promise<void>;
}>;
// Serves static/ files at their route paths, executes server/<route_id>.mjs
// per request for "server" routes (reading and parsing the route's data_file
// per request when data_strategy = "request", passing null otherwise),
// serves assets/, and serves data_file at DATA_PATH_PREFIX +
// "<route_id>.json" for data_strategy = "client" routes. Driven entirely by
// manifest.json; no SiteConfig access needed.

// src/measure/collect.ts
// `contracts` is required for the run-0 a11y checks (§6.2 → SampleFlags).
function collectSample(opts: {
  base_url: string; profile_id: string; route: ResolvedRouteConfig;
  contracts: IslandContract[]; arm: Arm; run_index: number;
}): Promise<MeasurementSample>;

function collectMany(opts: {
  base_url: string; profile_id: string; route: ResolvedRouteConfig;
  contracts: IslandContract[]; arm: Arm; n: number;
}): Promise<MeasurementSample[]>;   // run_index 0..n-1, sequential
```

---

## 12. ExperimentResult

```ts
interface MetricComparison {
  metric: MetricName;
  baseline_mean: number;    // mean of raw metric over baseline samples
  variant_mean: number;
  baseline_score: number;   // normalization (REWARD.md §2) applied to the mean
  variant_score: number;
  score_delta: number;      // variant_score − baseline_score
}

interface ExperimentResult {
  schema_version: 1;
  experiment_id: string;          // ex_…
  proposal_id: string;
  target_route_id: string;
  baseline_profile_id: string;
  variant_profile_id: string;
  n_per_arm: number;              // N_PER_ARM in production; tests may override
  started_at: string;
  completed_at: string;
  metric_comparisons: MetricComparison[];  // length 7, canonical MetricName order
  reward_baseline_mean: number;   // mean per-sample reward (REWARD.md §3)
  reward_baseline_sd: number;     // sample SD (n−1 denominator)
  reward_variant_mean: number;
  reward_variant_sd: number;
  reward_delta: number;           // variant_mean − baseline_mean
  z_statistic: number;            // REWARD.md §7
  verdict: Verdict;
  veto_codes: VetoCode[];         // non-empty iff verdict = "veto"; sorted asc
}
```

Persisted at `runs/experiments/<experiment_id>.json`; its samples at
`runs/samples/<experiment_id>.jsonl` (one `MeasurementSample` per line,
baseline runs first, then variant, each in `run_index` order).

```ts
// Stage 7 — src/experiment/run.ts
function runExperiment(opts: {
  site: ResolvedSiteConfig;
  contracts: IslandContract[];
  proposal: Proposal;             // status "pending"; runner sets "testing" etc.
  n_per_arm?: number;             // DEFAULT: N_PER_ARM (91)
  work_dir?: string;              // DEFAULT: repo root
}): Promise<ExperimentResult>;
// Orchestration: makeBaselineProfile + applyProposal → build both → serve →
// collectMany per arm on the target route only → decide (REWARD.md §7) →
// persist result, samples, updated proposal.
```

---

## 13. Knowledge base

### 13.1 KBScope

```ts
interface KBScope {
  route_id: string | null;
  renderer: Renderer | null;
  hydration: Hydration | null;
  render_mode: RenderMode | null;
  data_strategy: DataStrategy | null;
}
```

`null` means "any". A scope **applies** to a query `(route_id, renderer,
hydration, render_mode, data_strategy)` iff every non-null scope field equals
the corresponding query field. **Specificity** = the count of non-null fields
(0–5).

### 13.2 KBClaim

```ts
interface KBClaim {
  direction: KBDirection;   // effect on per-sample reward (REWARD.md §3)
  reward_delta: number;     // measured delta; 0 allowed; sign matches direction
                            // (neutral: any small value, record as measured)
  vetoed: boolean;          // true iff the source experiment verdict was "veto"
}
```

### 13.3 KBRecord

```ts
interface KBRecord {
  schema_version: 1;
  kb_id: string;            // kb_…
  created_at: string;
  scope: KBScope;
  claim: KBClaim;
  evidence: {
    experiment_id: string | null;  // null iff source = "seeded"
    sample_size: number;           // samples per arm; 0 iff source = "seeded"
  };
  source: KBSource;
  status: KBStatus;
}
```

Persisted at `kb/records.json`:

```ts
interface KBFile { schema_version: 1; records: KBRecord[]; }
```

Initial state (materialized in Stage 1): `{ "schema_version": 1, "records": [] }`.

### 13.4 Ingest rule (ExperimentResult → KBRecord)

Given a completed experiment and its proposal's mutation:

- `scope.route_id` = target_route_id; the mutated dimension gets the
  mutation's **new value**; all other dimension fields are `null`.
  (e.g. `set_hydration … value: "idle"` → `scope.hydration = "idle"`.)
- `direction`: verdict `accept` → `improves`; `reject` or `veto` →
  `regresses`; `inconclusive` → `neutral`.
- `reward_delta` = the experiment's `reward_delta`; `vetoed` = (verdict =
  `veto`); `evidence` = { experiment_id, n_per_arm }; `source` = `measured`;
  `status` = `active`.
- **Supersede rule**: any existing `active` record with an identical `scope`
  (all 5 fields equal) and same `source` is set to `superseded`.

### 13.5 Precedence (the ordering function — unambiguous, total)

When two **applicable** records conflict, the winner is decided by
`precedes`. This is a strict total order over any set of KBRecords with
distinct `kb_id`s.

```ts
// Returns true iff a takes precedence over b.
function precedes(a: KBRecord, b: KBRecord): boolean {
  // 1. Measured beats seeded.
  if (a.source !== b.source) return a.source === "measured";
  // 2. Higher scope specificity (count of non-null scope fields, 0–5) wins.
  const sa = specificity(a.scope), sb = specificity(b.scope);
  if (sa !== sb) return sa > sb;
  // 3. Larger per-arm sample size wins.
  if (a.evidence.sample_size !== b.evidence.sample_size)
    return a.evidence.sample_size > b.evidence.sample_size;
  // 4. Newer wins (ISO-8601 fixed-width strings: lexicographic = chronological).
  if (a.created_at !== b.created_at) return a.created_at > b.created_at;
  // 5. Final deterministic tiebreak: lexicographically greater kb_id wins.
  return a.kb_id > b.kb_id;
}
```

```ts
// Stage 8 — src/kb/precedence.ts
function specificity(s: KBScope): number;
function precedes(a: KBRecord, b: KBRecord): boolean;
// Winning applicable active record for a query, or null if none applies.
function query(records: KBRecord[], q: {
  route_id: string; renderer: Renderer; hydration: Hydration;
  render_mode: RenderMode; data_strategy: DataStrategy;
}): KBRecord | null;

// Stage 8 — src/kb/store.ts
function loadKB(path: string): KBFile;
function saveKB(path: string, kb: KBFile): void;

// Stage 8 — src/kb/ingest.ts
function ingest(kb: KBFile, result: ExperimentResult, proposal: Proposal): KBRecord;
// Applies §13.4 including supersede; mutates kb in place; returns new record.
```

---

## 14. Proposal generation (deterministic algorithm)

```ts
// Stage 8 — src/propose/generate.ts
function propose(opts: {
  site: ResolvedSiteConfig;
  contracts: IslandContract[];
  kb: KBFile;
  scan: MeasurementSample[];   // arm "scan", SCAN_SAMPLES per route, baseline profile
}): Proposal | null;
```

Normative algorithm:

1. **Target selection.** For each route, compute the mean per-sample reward
   (REWARD.md §3) over its scan samples. Target = the route with the lowest
   mean; ties broken by lexicographically smallest `route_id`.
2. **Candidate enumeration**, in this exact order: for each dimension in order
   [`set_hydration`, `set_renderer`, `set_render_mode`, `set_data_strategy`] —
   for island-scoped kinds, iterate the target route's islands in config
   order; for each, iterate the dimension's enum values in canonical order
   (§2), skipping the current value. Route-scoped kinds iterate enum values in
   canonical order, skipping the current value.
3. **Legality filter.** Apply the candidate mutation to a copy of the site;
   drop the candidate if any C-code (C001–C005) or S013/S011/S012 would be
   violated. (`set_data_strategy` to/from `"none"` is only legal when the
   route's `data_url` requirement (§5.2 S011/S012) remains satisfiable without
   inventing data — i.e. a mutation to `"none"` is legal only if no island
   requires `data`; a mutation from `"none"` is always dropped, since no
   `data_url` exists to serve it.)
4. **KB filter.** For each surviving candidate, form the query: the target
   route plus the candidate's post-mutation placement tuple of the affected
   island — for route-scoped mutations, evaluate every island on the route and
   take the winning record of highest precedence among the per-island winners
   (ties per §13.5). If the winning applicable record has `direction =
   "regresses"`, drop the candidate. Islandless routes query with the route
   fields set and `renderer`/`hydration` null — a scope with non-null
   island fields does not apply.
5. **Ranking.** Candidates whose winning record has `direction = "improves"`
   come first, ordered by that record's `reward_delta` descending (ties:
   enumeration order); then all remaining candidates in enumeration order.
6. **Emit** a `Proposal` (status `pending`) for the first ranked candidate,
   `rationale_kb_ids` = [winning record's kb_id] or [] if none. If no
   candidates survive, return `null`.

---

## 15. Repository layout (frozen paths)

**Amended by ADR-0013.** Package code lives in a pnpm workspace
(`packages/*`), not the flat `src/` tree originally specified here — see
`docs/PUBLIC_API.md` for the npm-name-to-directory mapping this paragraph
defers to. Nothing else on this page changes: type shapes, constraints,
budgets, module surfaces, and stage ownership are exactly as specified
elsewhere in this document, just addressed under a package's `src/` instead
of the repo's `src/`.

```
site.config.json                  reference SiteConfig (Appendix A.2)
islands/contracts.json            reference contracts (Appendix A.1)
islands/registry.json             written by Stage 3
fixtures/catalog.json             Appendix A.3
fixtures/dashboard.json           Appendix A.3
kb/records.json                   KB store, initialized empty (Stage 1)
docs/                             frozen documents + ADRs
packages/contracts/src/{types,constraints,validate,resolve}.ts        Stage 1
packages/islands/src/{contract,registry}.ts                           Stage 2
packages/renderers/src/{adapter,scheduler,react,preact,svelte,vanilla}.ts  Stage 3
packages/renderers/src/components/<contract_id>/{react.tsx,preact.tsx,svelte.svelte,vanilla.ts}  Stage 3
packages/build/src/build.ts                                           Stage 4
packages/measure/src/{serve,collect}.ts                               Stage 5
packages/reward/src/{normalize,reward,veto,decide}.ts                 Stage 6
packages/experiment/src/run.ts                                        Stage 7
packages/kb/src/{store,precedence,ingest}.ts  packages/kb/src/propose/generate.ts  Stage 8
dist/<profile_id>/…               build outputs (§9.2)
runs/{proposals,experiments,samples,scans}/…                 run artifacts
```

Every `packages/*/src/**/<name>.ts` has a colocated `<name>.test.ts`.
`packages/contracts/src/types.ts` contains, verbatim, every `type`/`interface`
declaration in this document, each `export`ed. `packages/contracts/src/constraints.ts`
exports the C-table and S-table as data plus the tier-defaults table (§8.2)
and constants (§1.4).

---

## Appendix A — Reference fixtures (normative; materialized by Stage 1)

### A.1 `islands/contracts.json`

```json
{
  "schema_version": 1,
  "contracts": [
    {
      "contract_id": "hero-cta",
      "props": [
        { "name": "heading",   "type": "string", "required": true,  "default": null },
        { "name": "cta_label", "type": "string", "required": true,  "default": null }
      ],
      "events": [ { "name": "cta_click", "payload": "void" } ],
      "a11y": {
        "role": "region",
        "label": { "source": "prop", "prop": "heading" },
        "keyboard": ["activate"],
        "focus": "none"
      }
    },
    {
      "contract_id": "nav-menu",
      "props": [
        { "name": "items", "type": "json", "required": true, "default": null }
      ],
      "events": [ { "name": "navigate", "payload": "json" } ],
      "a11y": {
        "role": "navigation",
        "label": { "source": "static", "value": "Main navigation" },
        "keyboard": ["activate", "navigate"],
        "focus": "none"
      }
    },
    {
      "contract_id": "data-table",
      "props": [
        { "name": "data",      "type": "json",   "required": true,  "default": null },
        { "name": "page_size", "type": "number", "required": false, "default": 10 }
      ],
      "events": [ { "name": "sort_change", "payload": "json" } ],
      "a11y": {
        "role": "region",
        "label": { "source": "static", "value": "Results table" },
        "keyboard": ["navigate", "activate"],
        "focus": "none"
      }
    }
  ]
}
```

### A.2 `site.config.json`

```json
{
  "schema_version": 1,
  "site_id": "reference",
  "routes": [
    {
      "route_id": "home",
      "path": "/",
      "title": "Home",
      "tier": "critical",
      "render_mode": "static",
      "data_strategy": "none",
      "data_url": null,
      "islands": [
        { "island_id": "nav",  "contract_id": "nav-menu",
          "renderer": "preact", "hydration": "load",
          "props": { "items": [ { "label": "Home", "href": "/" },
                                { "label": "Catalog", "href": "/catalog" },
                                { "label": "Dashboard", "href": "/dashboard" } ] } },
        { "island_id": "hero", "contract_id": "hero-cta",
          "renderer": "react",  "hydration": "idle",
          "props": { "heading": "Welcome", "cta_label": "Get started" } }
      ]
    },
    {
      "route_id": "catalog",
      "path": "/catalog",
      "title": "Catalog",
      "tier": "standard",
      "render_mode": "server",
      "data_strategy": "request",
      "data_url": "./fixtures/catalog.json",
      "islands": [
        { "island_id": "nav",   "contract_id": "nav-menu",
          "renderer": "preact", "hydration": "load",
          "props": { "items": [ { "label": "Home", "href": "/" } ] } },
        { "island_id": "table", "contract_id": "data-table",
          "renderer": "svelte", "hydration": "visible", "props": {} }
      ]
    },
    {
      "route_id": "dashboard",
      "path": "/dashboard",
      "title": "Dashboard",
      "tier": "deferred",
      "render_mode": "client",
      "data_strategy": "client",
      "data_url": "./fixtures/dashboard.json",
      "islands": [
        { "island_id": "nav",   "contract_id": "nav-menu",
          "renderer": "vanilla", "hydration": "load",
          "props": { "items": [ { "label": "Home", "href": "/" } ] } },
        { "island_id": "table", "contract_id": "data-table",
          "renderer": "react",  "hydration": "load",
          "props": { "page_size": 25 } }
      ]
    }
  ]
}
```

(Note `tier` and `budgets` defaults exercised: `home` omits `budgets`;
all routes omit nothing else that has a default except `budgets`.)

### A.3 Fixture data files

`fixtures/catalog.json`:

```json
{ "rows": [ { "sku": "a-1", "name": "Alpha", "price": 10 },
            { "sku": "b-2", "name": "Beta",  "price": 20 },
            { "sku": "c-3", "name": "Gamma", "price": 30 } ] }
```

`fixtures/dashboard.json`:

```json
{ "rows": [ { "metric": "visits", "value": 1204 },
            { "metric": "signups", "value": 87 } ] }
```

---

## Appendix B — Invalid-config test vectors (normative for Stage 1/2 tests)

Each vector is Appendix A.2 with one listed mutation applied; expected errors
are exact (code, pointer) sets.

| # | Mutation of A.2                                                        | Expected errors |
|---|------------------------------------------------------------------------|-----------------|
| B1 | `routes[0].data_strategy = "request"`                                 | `C001 /routes/0`, `S011 /routes/0` |
| B2 | `routes[2].data_strategy = "request"`                                 | `C002 /routes/2` |
| B3 | `routes[2].islands[0].hydration = "none"`                             | `C003 /routes/2/islands/0`, `C004 /routes/2/islands/0`, `C005 /routes/2/islands/0` |
| B4 | `routes[1].route_id = "home"`                                         | `S002 /routes/1` |
| B5 | `routes[1].data_url = null`                                           | `S011 /routes/1` |
| B6 | `routes[0].islands[1].props = { "heading": "Welcome" }`               | `S008 /routes/0/islands/1` |
| B7 | `routes[2].islands[1].props = { "page_size": "many" }`                | `S009 /routes/2/islands/1` |
| B8 | `routes[0].islands[0].props.data = 1` (added key)                     | `S010 /routes/0/islands/0` |
| B9 | `routes[0].islands[1].hydration = "none"`                             | `C005 /routes/0/islands/1` |

(B3 expects three codes: predicates are set-semantics, all matches reported.
C005 appears because `nav-menu` declares an event. B9 isolates C005 on a
static route where C003/C004 do not fire.)

END OF FROZEN SURFACE
