// KB precedence, per docs/CONTRACTS.md §13.1 and §13.5.
//
// `precedes` is a STRICT TOTAL ORDER over any set of KBRecords with distinct
// kb_ids — that is what lets `query` return exactly one winner or none, with
// no judgment required of the caller (ADR-0010). It is transcribed exactly as
// §13.5 writes it; the five tiebreak levels and their order are load-bearing.

import type { DataStrategy, Hydration, KBRecord, KBScope, RenderMode, Renderer } from "@harness/contracts";

export interface KBQuery {
  route_id: string;
  renderer: Renderer;
  hydration: Hydration;
  render_mode: RenderMode;
  data_strategy: DataStrategy;
}

// CONTRACTS §13.1 — count of non-null scope fields (0–5).
export function specificity(s: KBScope): number {
  let count = 0;
  if (s.route_id !== null) count++;
  if (s.renderer !== null) count++;
  if (s.hydration !== null) count++;
  if (s.render_mode !== null) count++;
  if (s.data_strategy !== null) count++;
  return count;
}

// CONTRACTS §13.1 — a scope APPLIES to a query iff every non-null scope
// field equals the corresponding query field. Null means "any".
//
// A query whose renderer/hydration are null (an islandless route, per §14
// step 4) can only be matched by a scope that is itself null on those
// fields — a scope with non-null island fields does not apply.
export function applies(scope: KBScope, query: Partial<KBQuery>): boolean {
  if (scope.route_id !== null && scope.route_id !== query.route_id) return false;
  if (scope.renderer !== null && scope.renderer !== query.renderer) return false;
  if (scope.hydration !== null && scope.hydration !== query.hydration) return false;
  if (scope.render_mode !== null && scope.render_mode !== query.render_mode) return false;
  if (scope.data_strategy !== null && scope.data_strategy !== query.data_strategy) return false;
  return true;
}

// CONTRACTS §13.5 — returns true iff a takes precedence over b.
// Transcribed exactly; do not reorder the tiebreaks.
export function precedes(a: KBRecord, b: KBRecord): boolean {
  // 1. Measured beats seeded.
  if (a.source !== b.source) return a.source === "measured";
  // 2. Higher scope specificity (count of non-null scope fields, 0–5) wins.
  const sa = specificity(a.scope);
  const sb = specificity(b.scope);
  if (sa !== sb) return sa > sb;
  // 3. Larger per-arm sample size wins.
  if (a.evidence.sample_size !== b.evidence.sample_size) return a.evidence.sample_size > b.evidence.sample_size;
  // 4. Newer wins (ISO-8601 fixed-width strings: lexicographic = chronological).
  if (a.created_at !== b.created_at) return a.created_at > b.created_at;
  // 5. Final deterministic tiebreak: lexicographically greater kb_id wins.
  return a.kb_id > b.kb_id;
}

// CONTRACTS §13.5 — winning applicable ACTIVE record for a query, or null.
export function query(records: KBRecord[], q: Partial<KBQuery>): KBRecord | null {
  let winner: KBRecord | null = null;
  for (const record of records) {
    if (record.status !== "active") continue;
    if (!applies(record.scope, q)) continue;
    if (winner === null || precedes(record, winner)) winner = record;
  }
  return winner;
}
