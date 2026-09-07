// KB persistence, per docs/CONTRACTS.md §13.3 and ADR-0012 (JSON files, no
// database, whole-file load/save, single writer).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { KBFile } from "@harness/contracts";

// CONTRACTS §13.5 — function loadKB(path: string): KBFile
export function loadKB(path: string): KBFile {
  return JSON.parse(readFileSync(path, "utf-8")) as KBFile;
}

// CONTRACTS §13.5 — function saveKB(path: string, kb: KBFile): void
// CONTRACTS §1.3: UTF-8 JSON, no BOM, "\n" line endings.
export function saveKB(path: string, kb: KBFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(kb, null, 2)}\n`, "utf-8");
}
