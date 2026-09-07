# ADR-0003 — Constraint table is an exhaustive deny-list with set semantics

**Status:** accepted (frozen with CONTRACTS v1)

## Context

240 placement tuples exist. The validator, the proposal generator, and every
human need the same answer to "is this combination legal?".

## Decision

Legality is defined by a deny-list of four predicates (C001–C004) with **set
semantics**: a tuple is illegal iff at least one predicate matches, and a
validator reports every matching code. Anything not matched is legal — the
list is exhaustive by definition. A checksum (60 illegal / 180 legal of 240)
is frozen as a normative test vector so any drift in enum sizes or predicates
is caught mechanically.

`renderer` participates in zero predicates. That is intentional: every
adapter must implement the full `RendererAdapter` surface (render, hydrate,
mount), so no renderer is intrinsically incompatible with any mode. The
contract-dependent rule (events require JS) is kept out of the tuple space as
`C005`.

## Alternatives rejected

- **Allow-list of legal tuples** — 180 rows to maintain; every enum addition
  requires editing dozens of rows instead of re-deriving predicates.
- **First-match-wins ordered rules** — makes reported codes depend on rule
  order, complicating tests (B3 in CONTRACTS Appendix B deliberately expects
  three codes at once).
- **Soft warnings for dubious combos** — a warning channel invites downstream
  judgment calls; cheap models must face only legal/illegal.

## Revisit when

Any enum gains or loses a member (the checksum must be re-derived and the
contract re-versioned), or a renderer appears that genuinely cannot implement
part of the adapter surface.
