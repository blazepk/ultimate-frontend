# ADR-0010 — KB precedence is a strict total order

**Status:** accepted (frozen with CONTRACTS v1)

## Context

Multiple KB records can apply to the same placement query and disagree. The
proposal generator (a cheap model's implementation) must resolve conflicts
identically every time, with no judgment.

## Decision

Conflicts are resolved by a five-step comparator (CONTRACTS §13.5):
measured > seeded, then higher scope specificity (count of non-null scope
fields), then larger per-arm sample size, then newer `created_at`
(fixed-width ISO strings compare lexicographically), then greater `kb_id`.
Distinct `kb_id`s guarantee a strict total order: `query()` has exactly one
answer or none. Superseding (identical scope + source) retires old records so
the store cannot accumulate contradictions at the same specificity forever.

Specificity is a plain count — `{route_id}` (1 field) loses to
`{renderer, hydration}` (2 fields) even though route-scoped knowledge is
arguably "closer". This is deliberately crude: any weighting scheme would
need its own justification, and the count is the only choice that requires
zero further parameters.

## Alternatives rejected

- **Bayesian merging of applicable records** — produces a posterior, not a
  record; downstream code needs a winner with a `kb_id` for
  `rationale_kb_ids`, and cheap models should not implement inference.
- **Recency-first ordering** — one noisy recent experiment would override a
  well-sampled established finding.
- **Field-weighted specificity (route_id counts double)** — an extra
  parameter with no evidence behind it; revisit only with data.
- **Letting conflicts coexist unresolved (report all)** — pushes the
  judgment to the generator, which must not make judgments.

## Revisit when

Inspection shows the generator repeatedly steered wrong by a high-specificity
low-sample record beating a broad high-sample one — then swap steps 2 and 3
(sample size before specificity) as a contract version bump.
