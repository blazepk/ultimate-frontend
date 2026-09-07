# ADR-0002 — `data_strategy` is route-scoped

**Status:** accepted (frozen with CONTRACTS v1)

## Context

`data_strategy` could live on routes, on islands, or both. The constraint
tuple (CONTRACTS §4) mixes island fields (renderer, hydration) with route
fields (render_mode), and data must be placed somewhere.

## Decision

`data_strategy` and `data_url` are declared on `RouteConfig` only. Islands
consume route data solely through the reserved `data` prop (CONTRACTS §6.4).
The placement tuple evaluated per island is
(island.renderer, island.hydration, route.render_mode, route.data_strategy).

A deliberate over-strictness follows: on a `data_strategy = "client"` route,
an island with `hydration = "none"` is illegal (`C004`) even when that island
has only constant props and never touches `data`. We accept rejecting some
harmless configurations to keep one data pipeline per route and a 240-cell
constraint space.

## Alternatives rejected

- **Per-island data_strategy** — doubles the tuple space (islands × route
  strategies), forces per-island data URLs, and makes arms incomparable when
  a mutation changes which fetches happen.
- **Per-island with route default + "inherit" value** — introduces a fifth
  pseudo-value resolved at validation; downstream stages would need resolution
  logic before every check.
- **Relaxing C004 for islands that don't require `data`** — makes legality
  depend on the contract, moving a tuple-space rule into contract-dependent
  territory and breaking the 60/180 checksum.

## Revisit when

A real route needs two islands with different data timings (e.g. static shell
data plus one live-data island), or the C004 over-strictness rejects a
configuration an experiment actually needs to test.
