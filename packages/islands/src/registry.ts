// Implementation-registry validator per docs/CONTRACTS.md §7.4. Checks
// R001/R002 plus S016/S001/S006 structural reuse for the registry file's own
// shape. `registry` is untrusted (`unknown`) — structurally checked here,
// not typed against a frozen `RegistryFile` interface (this function's
// signature only requires `unknown`, so no cross-package type extension is
// needed to implement it).

import type { SiteConfig, IslandContract, ValidationError, ErrorCode } from "@harness/contracts";

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function push(errors: ValidationError[], code: ErrorCode, pointer: string, message: string): void {
  errors.push({ code, pointer, message });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// CONTRACTS.md §7.4 — function validateRegistry(registry, config, contracts): ValidationError[]
export function validateRegistry(registry: unknown, config: SiteConfig, contracts: IslandContract[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const knownContractIds = new Set(contracts.map((c) => c.contract_id));
  const seenPairs = new Set<string>();

  if (!isPlainObject(registry)) {
    push(errors, "S016", "/schema_version", "registry is not an object");
    return sortErrors(errors);
  }
  if (registry.schema_version !== 1) {
    push(errors, "S016", "/schema_version", "schema_version must be exactly 1");
  }

  const implementations = registry.implementations;
  if (Array.isArray(implementations)) {
    implementations.forEach((impl: unknown, implIndex: number) => {
      const implPointer = `/implementations/${implIndex}`;
      if (!isPlainObject(impl)) return;

      if (typeof impl.contract_id === "string") {
        if (!ID_RE.test(impl.contract_id)) {
          push(errors, "S001", `${implPointer}/contract_id`, "contract_id fails the authored-ID format");
        }
        if (!knownContractIds.has(impl.contract_id)) {
          push(errors, "S006", `${implPointer}/contract_id`, `unknown contract_id "${impl.contract_id}"`);
        }
      }

      if (typeof impl.contract_id === "string" && typeof impl.renderer === "string") {
        const key = `${impl.contract_id}|${impl.renderer}`;
        if (seenPairs.has(key)) {
          push(errors, "R001", implPointer, `duplicate implementation for (${impl.contract_id}, ${impl.renderer})`);
        }
        seenPairs.add(key);
      }
    });
  }

  config.routes.forEach((route, routeIndex) => {
    route.islands.forEach((island, islandIndex) => {
      const key = `${island.contract_id}|${island.renderer}`;
      if (!seenPairs.has(key)) {
        push(
          errors,
          "R002",
          `/routes/${routeIndex}/islands/${islandIndex}`,
          `no registry entry for (${island.contract_id}, ${island.renderer})`,
        );
      }
    });
  });

  return sortErrors(errors);
}

function sortErrors(errors: ValidationError[]): ValidationError[] {
  return [...errors].sort((a, b) => {
    if (a.pointer !== b.pointer) return a.pointer < b.pointer ? -1 : 1;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return 0;
  });
}
