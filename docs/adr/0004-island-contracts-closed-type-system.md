# ADR-0004 — Island contracts use a closed JSON type system, not TypeScript types

**Status:** accepted (frozen with CONTRACTS v1)

## Context

An island's interface (props, events, accessibility) must be declared once and
satisfied identically by up to four renderer implementations, and must be
checkable by a validator and by the measurement harness at runtime.

## Decision

Contracts are data (`islands/contracts.json`), not code. Props use the closed
`PropType` union (`string | number | boolean | string[] | number[] | json`);
events are named `CustomEvent`s with a `PropType | "void"` payload; a11y is a
closed `A11ySpec` (role from a 9-value `AriaRole` subset, label source,
keyboard interactions from a 3-value enum, focus behavior from a 3-value
enum). The `data` prop is reserved and harness-injected (CONTRACTS §6.4).

This gives three properties no TS-type contract gives: (1) runtime-checkable
prop validation with stable error codes, (2) renderer-independence — a Svelte
and a React implementation are held to the same machine-readable surface,
(3) a measurable a11y obligation (REWARD veto V002) without an external
audit engine.

## Alternatives rejected

- **TypeScript interfaces as the contract** — not runtime-checkable; cheap
  models would need type-level reasoning to validate configs; ties contracts
  to one language's type system.
- **JSON Schema per island** — expressive but open-ended; validators would
  face arbitrary schema features, and closed enums could not be enforced.
- **Full ARIA role list** — 80+ roles invite misuse; the 9-value subset covers
  the reference contracts and forces deliberate extension.
- **axe-core as the a11y contract** — adds a heavyweight dependency and
  non-deterministic rule evolution; the four §6.2 checks are deterministic.

## Revisit when

A needed component genuinely cannot express its props in `PropType` (beyond
escaping to `"json"`), or the §6.2 checks miss an a11y regression that
matters in practice.
