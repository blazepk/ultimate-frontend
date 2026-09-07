# ADR-0007 — Scalar weighted reward gated by vetoes

**Status:** accepted (frozen with CONTRACTS v1)

## Context

The optimizer needs a single comparable number per arm, but a pure scalar
invites sacrificing one quality axis (accessibility, layout stability) for
another (bytes, latency).

## Decision

Reward is a fixed weighted sum of seven normalized metrics (REWARD §3),
computed **per sample** and compared via arm means. Safety is handled
lexicographically above the scalar: five vetoes (REWARD §5) are evaluated
first and any firing veto ends the experiment regardless of reward. The veto
list covers budget breaches (V001), the a11y contract (V002), hydration and
runtime failures (V003/V004), and single-metric collapse (V005, score drop
> 0.15) so the scalar cannot silently trade one metric to zero.

Weights (0.30 LCP, 0.15 CLS, 0.20 TBT, 0.10 TTFB, 0.15 JS, 0.05 HTML,
0.05 hydration) order the metrics by user-perceived impact, weight the
loading experience (LCP+TTFB = 0.40) and responsiveness (TBT+hydration =
0.25) above payload (0.20), and sum to exactly 1 so reward stays in [0, 1].
The exact values are a judgment call frozen to make experiments comparable
over time; their defense is the veto gate, not their precision.

## Alternatives rejected

- **Pareto/multi-objective comparison** — needs an arbitration rule anyway to
  emit accept/reject; that rule would be this scalar in disguise.
- **Lighthouse-style log-normal scoring curves** — opaque, versioned, and
  harder for downstream implementers to reproduce than a clamped ramp.
- **Learned/adaptive weights** — the reward becomes non-stationary and old KB
  records incomparable with new ones.
- **Veto as large negative reward** — re-enters the averaging machinery and
  can be outvoted by strong metrics; safety must be lexicographic.

## Revisit when

Accepted proposals cluster on improving only high-weight metrics while
low-weight metrics drift toward their V005 limit — evidence the weights, not
the mechanism, are mis-set. Reweighting is a contract version bump and
invalidates cross-version reward comparisons.
