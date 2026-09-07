# ADR-0011 — Eight-stage decomposition with explicit file ownership

**Status:** accepted (frozen with CONTRACTS v1)

## Context

Downstream implementation is performed by cheaper models with no access to
this design conversation. Every inter-stage interface they would otherwise
have to negotiate must be pre-decided, and every stage must be verifiable in
isolation.

## Decision

Eight stages, each owning a disjoint directory (CONTRACTS §15), each
consuming only `docs/` plus the **exported surfaces** of earlier stages
(exact signatures frozen in CONTRACTS §5.4, §7, §9.2, §11.3, §12, §13.5, §14
and REWARD §8):

1. contract types, structural+combination validation, resolution, fixture
   materialization; 2. contract/registry checks; 3. renderer adapters,
   scheduler, reference components; 4. build; 5. serve + measure; 6. reward;
   7. experiment orchestration; 8. KB + proposal generation.

Ordering follows the data flow (config → contracts → renderers → build →
samples → reward → experiment → knowledge), so stage k needs nothing from
stage > k. The riskiest inter-stage seams — the island wrapper HTML, the
`window.__HARNESS__` runtime state, `IslandBootSpec`, and the dist/ layout —
are frozen in CONTRACTS §7/§9 precisely because they cross the 3/4/5 stage
boundaries.

## Alternatives rejected

- **Fewer, larger stages (e.g. 3)** — each stage prompt would exceed what a
  cheap model executes reliably, and a failure invalidates more work.
- **Per-renderer stages (one stage per adapter)** — 4 near-identical prompts;
  the adapters share the scheduler and are cheaper to build together against
  one test harness.
- **Letting stages define their own module surfaces** — every seam would be
  invented twice by two different models; this is the primary failure mode
  the contract layer exists to prevent.

## Revisit when

A stage proves un-implementable within its listed inputs (a STAGE_INPUTS
gap), or two stages repeatedly need simultaneous changes for one feature —
evidence the boundary is drawn through, not between, responsibilities.
