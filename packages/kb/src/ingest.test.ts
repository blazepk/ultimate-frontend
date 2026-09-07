import { describe, it, expect } from "vitest";
import { ingest } from "./ingest";
import { makeRecord, makeResult, makeProposal, EMPTY_SCOPE } from "./test-utils";
import type { KBFile, Verdict } from "@harness/contracts";

function emptyKB(): KBFile {
  return { schema_version: 1, records: [] };
}

const hydrationMutation = { kind: "set_hydration", route_id: "home", island_id: "hero", value: "visible" } as const;

describe("ingest — scope construction (docs/CONTRACTS.md §13.4)", () => {
  it("sets route_id and ONLY the mutated dimension, leaving the other three null", () => {
    const kb = emptyKB();
    const record = ingest(kb, makeResult("accept"), makeProposal(hydrationMutation));
    expect(record.scope).toEqual({
      route_id: "home",
      renderer: null,
      hydration: "visible", // the mutation's NEW value
      render_mode: null,
      data_strategy: null,
    });
  });

  it("maps each mutation kind to its own scope dimension", () => {
    const cases = [
      { mutation: { kind: "set_renderer", route_id: "home", island_id: "hero", value: "svelte" } as const, field: "renderer", value: "svelte" },
      { mutation: { kind: "set_render_mode", route_id: "home", value: "server" } as const, field: "render_mode", value: "server" },
      { mutation: { kind: "set_data_strategy", route_id: "home", value: "client" } as const, field: "data_strategy", value: "client" },
    ];
    for (const { mutation, field, value } of cases) {
      const record = ingest(emptyKB(), makeResult("accept"), makeProposal(mutation));
      expect(record.scope[field as keyof typeof record.scope]).toBe(value);
      expect(record.scope.route_id).toBe("home");
    }
  });

  it("records the mutation's NEW value, never the value it replaced", () => {
    const record = ingest(emptyKB(), makeResult("accept"), makeProposal(hydrationMutation));
    expect(record.scope.hydration).toBe("visible");
  });
});

describe("ingest — verdict mapping and evidence (docs/CONTRACTS.md §13.4)", () => {
  const expected: Record<Verdict, { direction: string; vetoed: boolean }> = {
    accept: { direction: "improves", vetoed: false },
    reject: { direction: "regresses", vetoed: false },
    veto: { direction: "regresses", vetoed: true },
    inconclusive: { direction: "neutral", vetoed: false },
  };

  for (const verdict of ["accept", "reject", "veto", "inconclusive"] as const) {
    it(`maps verdict "${verdict}" to direction "${expected[verdict].direction}" with vetoed=${expected[verdict].vetoed}`, () => {
      const record = ingest(emptyKB(), makeResult(verdict), makeProposal(hydrationMutation));
      expect(record.claim.direction).toBe(expected[verdict].direction);
      expect(record.claim.vetoed).toBe(expected[verdict].vetoed);
    });
  }

  it("copies reward_delta from the experiment and stamps evidence, source, status", () => {
    const result = makeResult("accept", { reward_delta: 0.0421, experiment_id: "ex_1700000000000_0007", n_per_arm: 91 });
    const record = ingest(emptyKB(), result, makeProposal(hydrationMutation));
    expect(record.claim.reward_delta).toBe(0.0421);
    expect(record.evidence).toEqual({ experiment_id: "ex_1700000000000_0007", sample_size: 91 });
    expect(record.source).toBe("measured");
    expect(record.status).toBe("active");
    expect(record.schema_version).toBe(1);
    expect(record.kb_id).toMatch(/^kb_\d{13}_\d{4}$/);
  });
});

describe("ingest — supersede rule and mutation semantics (docs/CONTRACTS.md §13.4)", () => {
  it("mutates the KBFile in place and returns the new record", () => {
    const kb = emptyKB();
    const record = ingest(kb, makeResult("accept"), makeProposal(hydrationMutation));
    expect(kb.records).toHaveLength(1);
    expect(kb.records[0]).toBe(record);
  });

  for (const verdict of ["accept", "reject", "veto", "inconclusive"] as const) {
    it(`supersedes a prior identical-scope active record on a "${verdict}" ingest (round trip)`, () => {
      const kb = emptyKB();
      const first = ingest(kb, makeResult(verdict), makeProposal(hydrationMutation));
      expect(first.status).toBe("active");

      const second = ingest(kb, makeResult(verdict), makeProposal(hydrationMutation));
      expect(kb.records).toHaveLength(2);
      expect(first.status).toBe("superseded"); // retired in place
      expect(second.status).toBe("active");
      expect(second.scope).toEqual(first.scope);
    });
  }

  it("does NOT supersede a record whose scope differs in any field", () => {
    const kb = emptyKB();
    const other = ingest(kb, makeResult("accept"), makeProposal({ kind: "set_hydration", route_id: "home", island_id: "hero", value: "load" }));
    ingest(kb, makeResult("accept"), makeProposal(hydrationMutation)); // value "visible"
    expect(other.status).toBe("active"); // different hydration value -> untouched
  });

  it("does NOT supersede a record on a different route", () => {
    const kb = emptyKB();
    const otherRoute = ingest(
      kb,
      makeResult("accept"),
      makeProposal({ kind: "set_hydration", route_id: "catalog", island_id: "table", value: "visible" }),
    );
    ingest(kb, makeResult("accept"), makeProposal(hydrationMutation));
    expect(otherRoute.status).toBe("active");
  });

  it("does NOT supersede an already-superseded record (no double retirement)", () => {
    const kb = emptyKB();
    const first = ingest(kb, makeResult("accept"), makeProposal(hydrationMutation));
    ingest(kb, makeResult("accept"), makeProposal(hydrationMutation));
    expect(first.status).toBe("superseded");
    ingest(kb, makeResult("accept"), makeProposal(hydrationMutation));
    expect(first.status).toBe("superseded"); // unchanged
    expect(kb.records.filter((r) => r.status === "active")).toHaveLength(1);
  });

  it("does NOT supersede a SEEDED record with the same scope — sources coexist", () => {
    // precedes() step 1 already ranks measured above seeded, so retiring the
    // seeded record would destroy evidence for no benefit.
    const seeded = makeRecord({
      kb_id: "kb_seeded",
      source: "seeded",
      status: "active",
      scope: { ...EMPTY_SCOPE, route_id: "home", hydration: "visible" },
      evidence: { experiment_id: null, sample_size: 0 },
    });
    const kb: KBFile = { schema_version: 1, records: [seeded] };
    ingest(kb, makeResult("accept"), makeProposal(hydrationMutation));
    expect(seeded.status).toBe("active");
    expect(kb.records).toHaveLength(2);
  });

  it("leaves exactly one active record per scope after repeated ingests", () => {
    const kb = emptyKB();
    for (let i = 0; i < 5; i++) {
      ingest(kb, makeResult("accept"), makeProposal(hydrationMutation));
    }
    expect(kb.records).toHaveLength(5);
    expect(kb.records.filter((r) => r.status === "active")).toHaveLength(1);
  });
});
