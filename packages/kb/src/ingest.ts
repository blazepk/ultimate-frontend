// Experiment -> KB ingest, per docs/CONTRACTS.md §13.4.
//
// Every verdict is ingested — including "veto" and "inconclusive" (REWARD.md
// §7). An inconclusive result is real evidence that a dimension did not move
// the reward measurably, and the proposal generator uses it.

import type { ExperimentResult, KBFile, KBRecord, KBScope, Proposal, Verdict, KBDirection } from "@harness/contracts";

// CONTRACTS §1.1 — <prefix>_<unix_ms>_<seq>.
let idSeq = 0;
function generateId(prefix: string): string {
  const unixMs = Date.now().toString().padStart(13, "0");
  const seq = (idSeq++).toString().padStart(4, "0");
  return `${prefix}_${unixMs}_${seq}`;
}

// CONTRACTS §13.4 — accept → improves; reject | veto → regresses;
// inconclusive → neutral.
const VERDICT_TO_DIRECTION: Record<Verdict, KBDirection> = {
  accept: "improves",
  reject: "regresses",
  veto: "regresses",
  inconclusive: "neutral",
};

// CONTRACTS §13.4: scope.route_id = target_route_id; the MUTATED DIMENSION
// gets the mutation's NEW VALUE; all other dimension fields are null.
function scopeFromProposal(proposal: Proposal): KBScope {
  const scope: KBScope = {
    route_id: proposal.target_route_id,
    renderer: null,
    hydration: null,
    render_mode: null,
    data_strategy: null,
  };
  switch (proposal.mutation.kind) {
    case "set_hydration":
      scope.hydration = proposal.mutation.value;
      break;
    case "set_renderer":
      scope.renderer = proposal.mutation.value;
      break;
    case "set_render_mode":
      scope.render_mode = proposal.mutation.value;
      break;
    case "set_data_strategy":
      scope.data_strategy = proposal.mutation.value;
      break;
  }
  return scope;
}

function sameScope(a: KBScope, b: KBScope): boolean {
  return (
    a.route_id === b.route_id &&
    a.renderer === b.renderer &&
    a.hydration === b.hydration &&
    a.render_mode === b.render_mode &&
    a.data_strategy === b.data_strategy
  );
}

// CONTRACTS §13.5 — function ingest(kb, result, proposal): KBRecord
// Applies §13.4 including supersede; MUTATES kb in place; returns the new record.
export function ingest(kb: KBFile, result: ExperimentResult, proposal: Proposal): KBRecord {
  const scope = scopeFromProposal(proposal);

  // Supersede rule: any existing ACTIVE record with an identical scope (all
  // 5 fields equal) and the SAME SOURCE is retired. Scoping the supersede to
  // matching source is what keeps a new measured record from silently
  // retiring a seeded one it does not actually replace — they can coexist,
  // and `precedes` step 1 already ranks measured above seeded.
  for (const existing of kb.records) {
    if (existing.status === "active" && existing.source === "measured" && sameScope(existing.scope, scope)) {
      existing.status = "superseded";
    }
  }

  const record: KBRecord = {
    schema_version: 1,
    kb_id: generateId("kb"),
    created_at: new Date().toISOString(),
    scope,
    claim: {
      direction: VERDICT_TO_DIRECTION[result.verdict],
      reward_delta: result.reward_delta,
      vetoed: result.verdict === "veto",
    },
    evidence: {
      experiment_id: result.experiment_id,
      sample_size: result.n_per_arm,
    },
    source: "measured",
    status: "active",
  };

  kb.records.push(record);
  return record;
}
