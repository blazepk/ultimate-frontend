# ADR-0001 — Four placement dimensions with closed vocabularies

**Status:** accepted (frozen with CONTRACTS v1)

## Context

The harness adapts a site by moving islands/routes through a configuration
space. Every dimension multiplies the constraint table, the mutation space,
and the KB scope space, so each must earn its place.

## Decision

Exactly four dimensions, each a closed union (CONTRACTS §2):

- `renderer` (react | preact | svelte | vanilla) — justified because renderer
  choice is the dominant lever on `js_bytes`/`hydration_ms`, and the four
  values span the design space: large VDOM runtime, small VDOM runtime,
  compiled-away runtime, no runtime.
- `hydration` (none | load | idle | visible | interaction) — justified because
  hydration timing is the dominant lever on `tbt_ms` and perceived
  interactivity, and it is the cheapest mutation to test.
- `render_mode` (static | server | client) — justified because shell
  production strategy is the dominant lever on `ttfb_ms`/`lcp_ms`.
- `data_strategy` (none | static | request | client) — justified because data
  timing couples to all three others (the constraint table's cross-terms all
  involve it or hydration) and cannot be derived from them.

No fifth dimension. Candidates considered and removed: CSS strategy (no
metric in the frozen set isolates it), image loading policy (subsumable under
budgets), cache policy (localhost measurement makes it unobservable).

## Alternatives rejected

- **`media` hydration value (hydrate on media query)** — requires an open
  string parameter, breaking the closed-enum requirement.
- **`isr`/revalidate render mode** — requires a time parameter and a
  long-running server; unobservable in lab measurement.
- **Streaming SSR as a data strategy** — meaningful only with network latency
  between server and client; localhost lab measurement cannot observe it.
- **Solid/Vue renderers** — more values without widening the spanned design
  space (compiled and VDOM niches already covered).

## Revisit when

A quarter of experiments end `inconclusive` with all four dimensions' KB
records `neutral` for a route — evidence the space lacks a lever that matters
for that route — or field (RUM) measurement is introduced (making streaming
and ISR observable).
