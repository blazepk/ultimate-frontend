# ADR-0008 — Fixed-horizon experiments: n = 91 per arm, z-test decision

**Status:** accepted (frozen with CONTRACTS v1)

## Context

Each experiment compares baseline vs variant on one route. The decision
procedure must be implementable by a downstream model with no statistics
background, deterministic given the samples, and honest about noise.

## Decision

Fixed-horizon two-arm design: exactly `N_PER_ARM = 91` samples per arm
(REWARD §6: α = 0.05 two-sided, power 0.80, MDE δ = 0.05 reward units,
**assumed baseline per-sample reward SD σ = 0.12**), then a single
two-sample z-test (normal approximation, critical value 1.96; REWARD §7).
No peeking, no early stopping. `inconclusive` is a first-class verdict and is
recorded in the KB as `neutral` rather than being rounded to reject.

The σ = 0.12 assumption is the load-bearing guess: it was chosen as a
plausible SD for a [0,1]-bounded composite under 4× CPU throttle lab noise.
It is stated here precisely so it can be falsified from the first few hundred
real samples.

## Alternatives rejected

- **Sequential tests / bandits (Thompson sampling)** — better sample
  efficiency, but requires correction machinery (alpha spending, posterior
  bookkeeping) that a cheap implementing model will get subtly wrong; also
  makes KB records non-iid summaries.
- **Welch's t with Satterthwaite df** — at n = 91 the t and z critical values
  differ in the third decimal; the df formula is pure implementation risk.
- **Bootstrap CIs** — resampling loops and RNG seeding are needless
  nondeterminism in a contract that promises reproducibility.

## Revisit when

Observed pooled per-sample reward SD from real experiments falls outside
[0.06, 0.24] (half/double the assumption) — recompute n and re-freeze; or
experiment throughput becomes the bottleneck and the sample-efficiency of
sequential designs starts paying for their complexity.
