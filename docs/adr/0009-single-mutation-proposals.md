# ADR-0009 — One mutation, one route per proposal

**Status:** accepted (frozen with CONTRACTS v1)

## Context

A proposal is the unit of experimentation and of KB attribution. The richer a
proposal, the less an experiment's outcome says about any single change.

## Decision

A `Proposal` carries exactly **one** `Mutation` targeting exactly one route
(CONTRACTS §10). Measurement runs on the target route only. KB ingest
(CONTRACTS §13.4) can therefore attribute the full reward delta to a single
(route, dimension-value) scope with no confounding.

Consequences accepted: multi-step improvements (e.g. renderer swap that only
pays off combined with hydration change) are reachable only as two sequential
accepted proposals, and interaction effects are invisible to the KB. The
generator's KB filter partially compensates by steering later proposals with
earlier findings.

## Alternatives rejected

- **Mutation lists (2–3 per proposal)** — outcome attribution becomes "one of
  these helped"; KB scopes would need conjunction semantics and the
  precedence function loses its total-order simplicity.
- **Site-wide proposals** — a single reward over many routes hides
  per-route regressions and makes budgets/vetoes ambiguous (whose budget?).
- **Factorial designs** — statistically sound for interactions but explodes
  arm count (2^k builds and 91·2^k samples) and is far beyond what a cheap
  implementing model can be trusted to analyze.

## Revisit when

The KB shows repeated pairs of proposals where each single mutation was
rejected but domain reasoning says the pair should win — then introduce
two-mutation proposals with explicit conjunction scopes as a contract
version bump.
