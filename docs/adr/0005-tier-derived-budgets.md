# ADR-0005 — Per-route budgets default from three tiers

**Status:** accepted (frozen with CONTRACTS v1)

## Context

Every route needs a complete budget vector (7 metrics) for veto V001, but
authoring 7 numbers per route is noise, and un-defaulted optional fields are
banned by the contract requirements.

## Decision

Three tiers (`critical | standard | deferred`) each carry a full default
budget vector (CONTRACTS §8.2). A route declares a tier (default `standard`)
and may override any budget key; resolution merges key-by-key. Downstream
stages only ever see `ResolvedRouteConfig` with a complete `RouteBudgets`.

Budgets bound the per-arm **mean**, not per-sample values, so a single noisy
lab run cannot veto an experiment (flake handling is FLAKE_TOLERANCE's job).

## Alternatives rejected

- **Budgets required on every route** — repetitive, error-prone, and blocks
  fixture-driven tests from staying readable.
- **Site-wide single budget vector** — cannot express that a marketing entry
  route and an internal dashboard deserve different bars; V001 would either
  over-veto deferred routes or under-protect critical ones.
- **Continuous priority scalar instead of tiers** — requires interpolating
  budget vectors; three named tiers are auditable and enumerable in tests.
- **Percentile-based budgets (p75)** — needs far larger n per arm to
  estimate; means are stable at n = 91.

## Revisit when

Two routes in the same tier persistently need opposite overrides on 3+
metrics (evidence the tier vectors are mis-centered), or field data replaces
lab data (budget numbers were chosen for the lab environment in CONTRACTS
§11.2).
