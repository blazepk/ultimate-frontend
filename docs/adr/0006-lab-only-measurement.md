# ADR-0006 — Lab-only measurement with seven metrics

**Status:** accepted (frozen with CONTRACTS v1)

## Context

The reward loop needs samples that are cheap, reproducible, and available
before any real traffic exists. Field (RUM) data is the gold standard for
user experience but requires deployment, consent, and weeks of traffic.

## Decision

All measurement is lab-based: headless Chromium via Playwright on localhost,
fixed viewport 1366×768, 4× CPU throttle, fresh context per sample, fixed
settle protocol (CONTRACTS §11.2). The metric set is frozen at seven:
`lcp_ms, cls, tbt_ms, ttfb_ms, js_bytes, html_bytes, hydration_ms`.

Notable consequences accepted deliberately:

- **TBT stands in for INP** — INP requires real user interactions; TBT is its
  standard lab proxy.
- **`ttfb_ms` on localhost measures server render cost only** — that is
  exactly the component the `render_mode` dimension manipulates, so it stays.
- **Byte metrics use `encodedBodySize`** — the local server does not compress;
  deterministic and comparable across arms.
- **`hydration_ms` comes from the harness's own runtime state**
  (`window.__HARNESS__`), not a browser API, because no standard API observes
  island hydration.

## Alternatives rejected

- **RUM/field collection** — nothing is deployed yet; sample arrival rate
  would gate the whole experiment loop on traffic volume.
- **Lighthouse as the collector** — heavier, versioned scoring changes under
  us, and its composite score would smuggle in a second reward function.
- **Larger metric sets (FCP, Speed Index, memory)** — each added metric
  dilutes weights and widens the veto surface without adding an actuator:
  no dimension in ADR-0001 moves them independently of the existing seven.

## Revisit when

The site deploys to real users (add field collection as a new sample source
with its own contract version), or a dimension is added whose effect the
seven metrics cannot observe.
