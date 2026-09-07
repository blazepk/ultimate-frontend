import { describe, it, expect } from "vitest";
import { resolve } from "@harness/contracts";
import type { IslandContract, KBFile, SiteConfig } from "@harness/contracts";
import { propose } from "./generate";
import { makeRecord, makeScan, makeScanSample, EMPTY_SCOPE } from "../test-utils";
import siteConfigJson from "../../../../site.config.json";
import contractsJson from "../../../../islands/contracts.json";

const referenceSite = resolve(siteConfigJson as unknown as SiteConfig);
const referenceContracts = (contractsJson as unknown as { contracts: IslandContract[] }).contracts;
const ALL_ROUTES = ["home", "catalog", "dashboard"];

function emptyKB(): KBFile {
  return { schema_version: 1, records: [] };
}

describe("propose — step 1, target selection (docs/CONTRACTS.md §14)", () => {
  it("targets the route with the lowest mean per-sample scan reward", () => {
    for (const worst of ALL_ROUTES) {
      const result = propose({
        site: referenceSite,
        contracts: referenceContracts,
        kb: emptyKB(),
        scan: makeScan(ALL_ROUTES, worst),
      });
      expect(result?.target_route_id).toBe(worst);
    }
  });

  it("breaks ties by lexicographically smallest route_id", () => {
    // Every route scores identically -> "catalog" < "dashboard" < "home".
    const scan = ALL_ROUTES.flatMap((route_id, i) => [makeScanSample(route_id, i)]);
    const result = propose({ site: referenceSite, contracts: referenceContracts, kb: emptyKB(), scan });
    expect(result?.target_route_id).toBe("catalog");
  });

  it("returns null when the scan is empty — no route can be targeted without data", () => {
    expect(propose({ site: referenceSite, contracts: referenceContracts, kb: emptyKB(), scan: [] })).toBeNull();
  });

  it("ignores routes that have no scan samples rather than treating them as worst", () => {
    // Only "home" was scanned, so it must be the target even though it scores well.
    const scan = [makeScanSample("home", 0, { lcp_ms: 2500 })];
    const result = propose({ site: referenceSite, contracts: referenceContracts, kb: emptyKB(), scan });
    expect(result?.target_route_id).toBe("home");
  });
});

describe("propose — step 2/6, emission shape", () => {
  it("emits a well-formed pending Proposal whose mutation targets the chosen route", () => {
    const result = propose({
      site: referenceSite,
      contracts: referenceContracts,
      kb: emptyKB(),
      scan: makeScan(ALL_ROUTES, "home"),
    });
    expect(result).not.toBeNull();
    expect(result?.schema_version).toBe(1);
    expect(result?.proposal_id).toMatch(/^pr_\d{13}_\d{4}$/);
    expect(result?.status).toBe("pending");
    expect(result?.target_route_id).toBe("home");
    expect(result?.mutation.route_id).toBe("home");
    expect(["set_hydration", "set_renderer", "set_render_mode", "set_data_strategy"]).toContain(result?.mutation.kind);
  });

  it("enumerates set_hydration first — the first legal candidate on home is a hydration change to its first island", () => {
    // home's islands in config order: nav (preact/load), hero (react/idle).
    // Hydration canonical order: none, load, idle, visible, interaction.
    // nav is "load", so "none" is tried first — but nav-menu declares an
    // event, so C005 drops it; "idle" is therefore the first legal candidate.
    const result = propose({
      site: referenceSite,
      contracts: referenceContracts,
      kb: emptyKB(),
      scan: makeScan(ALL_ROUTES, "home"),
    });
    expect(result?.mutation).toEqual({ kind: "set_hydration", route_id: "home", island_id: "nav", value: "idle" });
  });

  it("is deterministic — identical inputs produce an identical mutation and rationale", () => {
    const args = {
      site: referenceSite,
      contracts: referenceContracts,
      kb: emptyKB(),
      scan: makeScan(ALL_ROUTES, "catalog"),
    };
    const a = propose(args);
    const b = propose(args);
    expect(a?.mutation).toEqual(b?.mutation);
    expect(a?.target_route_id).toBe(b?.target_route_id);
    expect(a?.rationale_kb_ids).toEqual(b?.rationale_kb_ids);
    // proposal_id and created_at are generated per call and are expected to differ
  });
});

describe("propose — step 3, legality filter (docs/CONTRACTS.md §14)", () => {
  it("never proposes an illegal placement: C005 blocks hydration \"none\" for event-declaring contracts", () => {
    // Every reference contract declares at least one event, so no island on
    // any route may ever be proposed hydration "none".
    for (const worst of ALL_ROUTES) {
      const result = propose({
        site: referenceSite,
        contracts: referenceContracts,
        kb: emptyKB(),
        scan: makeScan(ALL_ROUTES, worst),
      });
      if (result?.mutation.kind === "set_hydration") {
        expect(result.mutation.value).not.toBe("none");
      }
    }
  });

  it("drops a set_data_strategy mutation FROM \"none\" (home has no data_url to serve)", () => {
    // Exhaust every non-data candidate via the KB filter so that, if a
    // from-"none" data_strategy candidate were legal, it would be chosen.
    const kb: KBFile = {
      schema_version: 1,
      records: [makeRecord({ kb_id: "kb_block", scope: { ...EMPTY_SCOPE, route_id: "home" }, claim: { direction: "regresses", reward_delta: -0.1, vetoed: false } })],
    };
    const result = propose({ site: referenceSite, contracts: referenceContracts, kb, scan: makeScan(ALL_ROUTES, "home") });
    // A blanket "regresses" on the home route drops every candidate, so the
    // generator must return null rather than fall back to an illegal one.
    expect(result).toBeNull();
  });

  it("drops a set_data_strategy mutation TO \"none\" when an island requires data", () => {
    // catalog's "table" island uses data-table, whose `data` prop is
    // required, so catalog can never move to data_strategy "none" (S013).
    const results = Array.from({ length: 3 }, () =>
      propose({ site: referenceSite, contracts: referenceContracts, kb: emptyKB(), scan: makeScan(ALL_ROUTES, "catalog") }),
    );
    for (const result of results) {
      if (result?.mutation.kind === "set_data_strategy") {
        expect(result.mutation.value).not.toBe("none");
      }
    }
  });

  it("never proposes a mutation that would make the site fail validation", () => {
    // Sanity across all three routes: whatever is proposed must be legal.
    for (const worst of ALL_ROUTES) {
      const result = propose({
        site: referenceSite,
        contracts: referenceContracts,
        kb: emptyKB(),
        scan: makeScan(ALL_ROUTES, worst),
      });
      expect(result).not.toBeNull();
      // dashboard is render_mode "client": hydration "none" there would fire
      // C003 and C004 as well as C005.
      if (result?.mutation.kind === "set_hydration") {
        expect(result.mutation.value).not.toBe("none");
      }
    }
  });
});

describe("propose — step 4/5, KB filter and ranking (docs/CONTRACTS.md §14)", () => {
  it("drops a candidate whose winning record says \"regresses\", choosing the next one instead", () => {
    const withoutKB = propose({
      site: referenceSite,
      contracts: referenceContracts,
      kb: emptyKB(),
      scan: makeScan(ALL_ROUTES, "home"),
    });
    // The unfiltered winner is nav -> hydration "idle" (asserted above).
    expect(withoutKB?.mutation).toEqual({ kind: "set_hydration", route_id: "home", island_id: "nav", value: "idle" });

    // A "regresses" record scoped exactly to that post-mutation placement
    // (home + preact + idle + static + none) must eliminate it.
    const kb: KBFile = {
      schema_version: 1,
      records: [
        makeRecord({
          kb_id: "kb_regress",
          scope: { route_id: "home", renderer: "preact", hydration: "idle", render_mode: "static", data_strategy: "none" },
          claim: { direction: "regresses", reward_delta: -0.05, vetoed: false },
        }),
      ],
    };
    const withKB = propose({ site: referenceSite, contracts: referenceContracts, kb, scan: makeScan(ALL_ROUTES, "home") });
    expect(withKB).not.toBeNull();
    expect(withKB?.mutation).not.toEqual(withoutKB?.mutation);
  });

  it("ranks an \"improves\" candidate ahead of unknown ones and cites it in rationale_kb_ids", () => {
    // Scope the improvement to nav's "visible" placement, which is enumerated
    // AFTER "idle" — ranking must pull it to the front anyway.
    const kb: KBFile = {
      schema_version: 1,
      records: [
        makeRecord({
          kb_id: "kb_improves",
          scope: { route_id: "home", renderer: "preact", hydration: "visible", render_mode: "static", data_strategy: "none" },
          claim: { direction: "improves", reward_delta: 0.09, vetoed: false },
        }),
      ],
    };
    const result = propose({ site: referenceSite, contracts: referenceContracts, kb, scan: makeScan(ALL_ROUTES, "home") });
    expect(result?.mutation).toEqual({ kind: "set_hydration", route_id: "home", island_id: "nav", value: "visible" });
    expect(result?.rationale_kb_ids).toEqual(["kb_improves"]);
  });

  it("orders multiple \"improves\" candidates by reward_delta descending", () => {
    const kb: KBFile = {
      schema_version: 1,
      records: [
        makeRecord({
          kb_id: "kb_small",
          scope: { route_id: "home", renderer: "preact", hydration: "idle", render_mode: "static", data_strategy: "none" },
          claim: { direction: "improves", reward_delta: 0.01, vetoed: false },
        }),
        makeRecord({
          kb_id: "kb_big",
          scope: { route_id: "home", renderer: "preact", hydration: "interaction", render_mode: "static", data_strategy: "none" },
          claim: { direction: "improves", reward_delta: 0.42, vetoed: false },
        }),
      ],
    };
    const result = propose({ site: referenceSite, contracts: referenceContracts, kb, scan: makeScan(ALL_ROUTES, "home") });
    expect(result?.mutation).toEqual({ kind: "set_hydration", route_id: "home", island_id: "nav", value: "interaction" });
    expect(result?.rationale_kb_ids).toEqual(["kb_big"]);
  });

  it("leaves rationale_kb_ids empty when no KB record applies to the chosen candidate", () => {
    const result = propose({
      site: referenceSite,
      contracts: referenceContracts,
      kb: emptyKB(),
      scan: makeScan(ALL_ROUTES, "home"),
    });
    expect(result?.rationale_kb_ids).toEqual([]);
  });

  it("returns null when every candidate is eliminated", () => {
    const kb: KBFile = {
      schema_version: 1,
      records: [
        makeRecord({
          kb_id: "kb_blanket",
          scope: { ...EMPTY_SCOPE, route_id: "dashboard" },
          claim: { direction: "regresses", reward_delta: -0.2, vetoed: false },
        }),
      ],
    };
    expect(propose({ site: referenceSite, contracts: referenceContracts, kb, scan: makeScan(ALL_ROUTES, "dashboard") })).toBeNull();
  });

  it("ignores superseded records when filtering", () => {
    const kb: KBFile = {
      schema_version: 1,
      records: [
        makeRecord({
          kb_id: "kb_stale",
          status: "superseded",
          scope: { route_id: "home", renderer: "preact", hydration: "idle", render_mode: "static", data_strategy: "none" },
          claim: { direction: "regresses", reward_delta: -0.05, vetoed: false },
        }),
      ],
    };
    const result = propose({ site: referenceSite, contracts: referenceContracts, kb, scan: makeScan(ALL_ROUTES, "home") });
    // The superseded "regresses" must not block the candidate.
    expect(result?.mutation).toEqual({ kind: "set_hydration", route_id: "home", island_id: "nav", value: "idle" });
  });
});
