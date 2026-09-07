import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKB, saveKB } from "./store";
import { makeRecord } from "./test-utils";
import type { KBFile } from "@harness/contracts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "harness-kb-store-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadKB / saveKB (docs/CONTRACTS.md §13.3, ADR-0012)", () => {
  it("round-trips a KBFile without loss", () => {
    const kb: KBFile = { schema_version: 1, records: [makeRecord(), makeRecord({ kb_id: "kb_1700000000000_0001" })] };
    const path = join(dir, "records.json");
    saveKB(path, kb);
    expect(loadKB(path)).toEqual(kb);
  });

  it("round-trips the empty initial state CONTRACTS §13.3 specifies", () => {
    const path = join(dir, "records.json");
    saveKB(path, { schema_version: 1, records: [] });
    expect(loadKB(path)).toEqual({ schema_version: 1, records: [] });
  });

  it("writes UTF-8 JSON terminated with a newline (CONTRACTS §1.3)", () => {
    const path = join(dir, "records.json");
    saveKB(path, { schema_version: 1, records: [] });
    const raw = readFileSync(path, "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.startsWith("{")).toBe(true); // no BOM
    expect(raw).not.toContain("\r\n");
  });

  it("creates missing parent directories rather than failing", () => {
    const path = join(dir, "nested", "deeper", "records.json");
    saveKB(path, { schema_version: 1, records: [] });
    expect(existsSync(path)).toBe(true);
  });

  it("preserves every KBRecord field through the round trip, including nulls in scope", () => {
    const record = makeRecord({
      scope: { route_id: "home", renderer: null, hydration: "idle", render_mode: null, data_strategy: null },
      claim: { direction: "regresses", reward_delta: -0.02, vetoed: true },
      evidence: { experiment_id: null, sample_size: 0 },
      source: "seeded",
      status: "superseded",
    });
    const path = join(dir, "records.json");
    saveKB(path, { schema_version: 1, records: [record] });
    const loaded = loadKB(path);
    expect(loaded.records[0]).toEqual(record);
    expect(loaded.records[0].scope.renderer).toBeNull();
    expect(loaded.records[0].evidence.experiment_id).toBeNull();
  });
});
