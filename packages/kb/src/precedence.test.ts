import { describe, it, expect } from "vitest";
import { specificity, precedes, applies, query } from "./precedence";
import { makeRecord, EMPTY_SCOPE } from "./test-utils";
import type { KBScope } from "@harness/contracts";

const FULL_QUERY = {
  route_id: "home",
  renderer: "react",
  hydration: "idle",
  render_mode: "static",
  data_strategy: "none",
} as const;

describe("specificity (docs/CONTRACTS.md §13.1)", () => {
  it("counts non-null scope fields, 0 through 5", () => {
    expect(specificity(EMPTY_SCOPE)).toBe(0);
    expect(specificity({ ...EMPTY_SCOPE, route_id: "home" })).toBe(1);
    expect(specificity({ ...EMPTY_SCOPE, route_id: "home", renderer: "react" })).toBe(2);
    expect(
      specificity({ route_id: "home", renderer: "react", hydration: "idle", render_mode: "static", data_strategy: "none" }),
    ).toBe(5);
  });
});

describe("applies (docs/CONTRACTS.md §13.1)", () => {
  it("a fully-null scope applies to any query", () => {
    expect(applies(EMPTY_SCOPE, FULL_QUERY)).toBe(true);
  });

  it("a scope applies when every non-null field matches", () => {
    expect(applies({ ...EMPTY_SCOPE, route_id: "home", renderer: "react" }, FULL_QUERY)).toBe(true);
  });

  it("a scope does not apply when any non-null field differs", () => {
    expect(applies({ ...EMPTY_SCOPE, renderer: "svelte" }, FULL_QUERY)).toBe(false);
    expect(applies({ ...EMPTY_SCOPE, route_id: "catalog" }, FULL_QUERY)).toBe(false);
  });

  it("a scope with non-null island fields does not apply to an islandless query (§14 step 4)", () => {
    const islandless = { route_id: "home", render_mode: "static", data_strategy: "none" } as const;
    expect(applies({ ...EMPTY_SCOPE, renderer: "react" }, islandless)).toBe(false);
    expect(applies({ ...EMPTY_SCOPE, hydration: "idle" }, islandless)).toBe(false);
    expect(applies({ ...EMPTY_SCOPE, route_id: "home" }, islandless)).toBe(true);
  });
});

// CONTRACTS §13.5 defines five tiebreak levels, applied strictly in order.
// Each test below holds every EARLIER level equal so it isolates exactly one.
describe("precedes — the five tiebreak levels in order (docs/CONTRACTS.md §13.5)", () => {
  it("level 1: measured beats seeded, even when seeded is more specific and better-evidenced", () => {
    const measured = makeRecord({ kb_id: "kb_a", source: "measured", scope: EMPTY_SCOPE, evidence: { experiment_id: "ex_1", sample_size: 1 } });
    const seeded = makeRecord({
      kb_id: "kb_z",
      source: "seeded",
      scope: { route_id: "home", renderer: "react", hydration: "idle", render_mode: "static", data_strategy: "none" },
      evidence: { experiment_id: null, sample_size: 0 },
      created_at: "2099-01-01T00:00:00.000Z",
    });
    expect(precedes(measured, seeded)).toBe(true);
    expect(precedes(seeded, measured)).toBe(false);
  });

  it("level 2: higher scope specificity wins (same source)", () => {
    const specific = makeRecord({ kb_id: "kb_a", scope: { ...EMPTY_SCOPE, route_id: "home", renderer: "react" } });
    const broad = makeRecord({ kb_id: "kb_z", scope: { ...EMPTY_SCOPE, route_id: "home" } });
    expect(precedes(specific, broad)).toBe(true);
    expect(precedes(broad, specific)).toBe(false);
  });

  it("level 3: larger sample size wins (same source and specificity)", () => {
    const big = makeRecord({ kb_id: "kb_a", evidence: { experiment_id: "ex_1", sample_size: 91 } });
    const small = makeRecord({ kb_id: "kb_z", evidence: { experiment_id: "ex_2", sample_size: 10 } });
    expect(precedes(big, small)).toBe(true);
    expect(precedes(small, big)).toBe(false);
  });

  it("level 4: newer created_at wins (same source, specificity, sample size)", () => {
    const newer = makeRecord({ kb_id: "kb_a", created_at: "2026-06-01T00:00:00.000Z" });
    const older = makeRecord({ kb_id: "kb_z", created_at: "2026-01-01T00:00:00.000Z" });
    expect(precedes(newer, older)).toBe(true);
    expect(precedes(older, newer)).toBe(false);
  });

  it("level 5: lexicographically greater kb_id is the final deterministic tiebreak", () => {
    const greater = makeRecord({ kb_id: "kb_1700000000000_0009" });
    const lesser = makeRecord({ kb_id: "kb_1700000000000_0001" });
    expect(precedes(greater, lesser)).toBe(true);
    expect(precedes(lesser, greater)).toBe(false);
  });

  it("is a strict total order: for distinct kb_ids exactly one direction holds", () => {
    const records = [
      makeRecord({ kb_id: "kb_a", source: "seeded" }),
      makeRecord({ kb_id: "kb_b", scope: { ...EMPTY_SCOPE, route_id: "home" } }),
      makeRecord({ kb_id: "kb_c", evidence: { experiment_id: "ex", sample_size: 5 } }),
      makeRecord({ kb_id: "kb_d", created_at: "2026-09-09T00:00:00.000Z" }),
      makeRecord({ kb_id: "kb_e" }),
    ];
    for (const a of records) {
      for (const b of records) {
        if (a.kb_id === b.kb_id) continue;
        expect(precedes(a, b)).toBe(!precedes(b, a)); // exactly one direction
      }
    }
  });
});

describe("query (docs/CONTRACTS.md §13.5)", () => {
  it("returns null when no record applies", () => {
    expect(query([makeRecord({ scope: { ...EMPTY_SCOPE, renderer: "svelte" } })], FULL_QUERY)).toBeNull();
  });

  it("returns null for an empty record set", () => {
    expect(query([], FULL_QUERY)).toBeNull();
  });

  it("ignores superseded records entirely, even when they would otherwise win", () => {
    const superseded = makeRecord({
      kb_id: "kb_winner",
      status: "superseded",
      scope: { route_id: "home", renderer: "react", hydration: "idle", render_mode: "static", data_strategy: "none" },
    });
    const active = makeRecord({ kb_id: "kb_active", status: "active", scope: { ...EMPTY_SCOPE, route_id: "home" } });
    expect(query([superseded, active], FULL_QUERY)?.kb_id).toBe("kb_active");
  });

  it("returns the single highest-precedence applicable active record", () => {
    const records = [
      makeRecord({ kb_id: "kb_broad", scope: EMPTY_SCOPE }),
      makeRecord({ kb_id: "kb_specific", scope: { ...EMPTY_SCOPE, route_id: "home", renderer: "react" } }),
      makeRecord({ kb_id: "kb_seeded", source: "seeded", scope: { ...EMPTY_SCOPE, route_id: "home", renderer: "react", hydration: "idle" } }),
    ];
    expect(query(records, FULL_QUERY)?.kb_id).toBe("kb_specific");
  });

  it("is order-independent — shuffling the record array does not change the winner", () => {
    const records = [
      makeRecord({ kb_id: "kb_1", scope: EMPTY_SCOPE }),
      makeRecord({ kb_id: "kb_2", scope: { ...EMPTY_SCOPE, route_id: "home" } }),
      makeRecord({ kb_id: "kb_3", scope: { ...EMPTY_SCOPE, route_id: "home", renderer: "react" } }),
    ];
    const forward = query(records, FULL_QUERY)?.kb_id;
    const reversed = query([...records].reverse(), FULL_QUERY)?.kb_id;
    expect(forward).toBe("kb_3");
    expect(reversed).toBe("kb_3");
  });

  it("matches an islandless query only against scopes with null island fields", () => {
    const islandless = { route_id: "home", render_mode: "static", data_strategy: "none" } as const;
    const records = [
      makeRecord({ kb_id: "kb_island", scope: { ...EMPTY_SCOPE, route_id: "home", renderer: "react" } }),
      makeRecord({ kb_id: "kb_route", scope: { ...EMPTY_SCOPE, route_id: "home" } }),
    ];
    expect(query(records, islandless)?.kb_id).toBe("kb_route");
  });
});

describe("scope shape", () => {
  it("KBScope has exactly the five fields §13.1 names", () => {
    const scope: KBScope = { ...EMPTY_SCOPE };
    expect(Object.keys(scope).sort()).toEqual(["data_strategy", "hydration", "render_mode", "renderer", "route_id"]);
  });
});
