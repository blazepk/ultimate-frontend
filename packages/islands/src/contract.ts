// Island-contract validator per docs/CONTRACTS.md §5.4, §6, §4.3. These
// checks live outside @harness/contracts because they need IslandContract
// data (from islands/contracts.json), which that package never loads:
// S006-S010, S013 (§6), C005 (§4.3, EVENTS_REQUIRE_JS). C001-C004 remain
// @harness/contracts's `validate()`/`checkConstraints` job — not
// re-implemented here.

import type { SiteConfig, IslandContract, ValidationError, ErrorCode, JsonValue, PropType } from "@harness/contracts";

const CONTRACT_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const NAME_RE = /^[a-z][a-z0-9_]{0,31}$/;

function push(errors: ValidationError[], code: ErrorCode, pointer: string, message: string): void {
  errors.push({ code, pointer, message });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// CONTRACTS.md §6.3 — PropType satisfaction rules.
function satisfiesPropType(value: JsonValue, type: PropType): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "string[]":
      return Array.isArray(value) && value.every((v) => typeof v === "string");
    case "number[]":
      return Array.isArray(value) && value.every((v) => typeof v === "number" && Number.isFinite(v));
    case "json":
      return true;
  }
}

// CONTRACTS.md §5.4 — function validateWithContracts(config, contracts): ValidationError[]
// Checks S006-S010, S013, C005.
export function validateWithContracts(config: SiteConfig, contracts: IslandContract[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const byId = new Map(contracts.map((c) => [c.contract_id, c]));

  config.routes.forEach((route, routeIndex) => {
    route.islands.forEach((island, islandIndex) => {
      const islandPointer = `/routes/${routeIndex}/islands/${islandIndex}`;
      const contract = byId.get(island.contract_id);

      if (!contract) {
        push(errors, "S006", `${islandPointer}/contract_id`, `unknown contract_id "${island.contract_id}"`);
        return;
      }

      // "data" is reserved (§6.4) and exempt from the unknown-prop check —
      // its presence is exclusively S010's concern, never S007's, whether
      // or not the contract happens to declare a "data" PropSpec.
      const declaredNames = new Set(contract.props.map((p) => p.name));
      for (const key of Object.keys(island.props)) {
        if (key !== "data" && !declaredNames.has(key)) {
          push(errors, "S007", islandPointer, `unknown prop "${key}" not declared by contract "${contract.contract_id}"`);
        }
      }

      for (const propSpec of contract.props) {
        if (propSpec.required && propSpec.name !== "data" && !(propSpec.name in island.props)) {
          push(errors, "S008", islandPointer, `missing required prop "${propSpec.name}"`);
        }
      }

      for (const [key, value] of Object.entries(island.props)) {
        const propSpec = contract.props.find((p) => p.name === key);
        if (propSpec && !satisfiesPropType(value, propSpec.type)) {
          push(errors, "S009", islandPointer, `prop "${key}" fails its declared type "${propSpec.type}"`);
        }
      }

      if ("data" in island.props) {
        push(errors, "S010", islandPointer, 'props must not contain the reserved key "data"');
      }

      const dataProp = contract.props.find((p) => p.name === "data");
      if (dataProp?.required && route.data_strategy === "none") {
        push(errors, "S013", islandPointer, 'contract requires "data" but route data_strategy is "none"');
      }

      if (contract.events.length >= 1 && island.hydration === "none") {
        push(errors, "C005", islandPointer, "contract declares events but hydration is \"none\"");
      }
    });
  });

  return sortErrors(errors);
}

// CONTRACTS.md §6.5 — function validateContracts(contracts): ValidationError[]
// Structural validity of a ContractsFile.
export function validateContracts(contracts: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isPlainObject(contracts)) {
    push(errors, "S016", "/schema_version", "contracts file is not an object");
    return sortErrors(errors);
  }
  if (contracts.schema_version !== 1) {
    push(errors, "S016", "/schema_version", "schema_version must be exactly 1");
  }

  const list = contracts.contracts;
  if (!Array.isArray(list)) {
    return sortErrors(errors);
  }

  const seenContractIds = new Set<string>();

  list.forEach((contract: unknown, contractIndex: number) => {
    const contractPointer = `/contracts/${contractIndex}`;
    if (!isPlainObject(contract)) return;

    if (typeof contract.contract_id === "string") {
      if (!CONTRACT_ID_RE.test(contract.contract_id)) {
        push(errors, "S001", `${contractPointer}/contract_id`, "contract_id fails the authored-ID format");
      }
      if (seenContractIds.has(contract.contract_id)) {
        push(errors, "S005", contractPointer, `duplicate contract_id "${contract.contract_id}"`);
      }
      seenContractIds.add(contract.contract_id);
    }

    const props = contract.props;
    const propNamesByThisContract = new Set<string>();
    if (Array.isArray(props)) {
      props.forEach((prop: unknown, propIndex: number) => {
        const propPointer = `${contractPointer}/props/${propIndex}`;
        if (!isPlainObject(prop)) return;

        if (typeof prop.name === "string") {
          if (!NAME_RE.test(prop.name)) push(errors, "S001", `${propPointer}/name`, "prop name fails the name format");
          if (propNamesByThisContract.has(prop.name)) {
            push(errors, "S005", propPointer, `duplicate prop name "${prop.name}" in contract`);
          }
          propNamesByThisContract.add(prop.name);
        }

        const propType = prop.type as PropType | undefined;
        if (typeof propType === "string" && prop.default !== null) {
          if (prop.required === true) {
            push(errors, "S009", `${propPointer}/default`, "default must be null when required is true");
          } else if (!satisfiesPropType(prop.default as JsonValue, propType)) {
            push(errors, "S009", `${propPointer}/default`, "default value fails its own declared type");
          }
        }
      });
    }

    const events = contract.events;
    const eventNamesByThisContract = new Set<string>();
    if (Array.isArray(events)) {
      events.forEach((event: unknown, eventIndex: number) => {
        const eventPointer = `${contractPointer}/events/${eventIndex}`;
        if (!isPlainObject(event)) return;
        if (typeof event.name === "string") {
          if (!NAME_RE.test(event.name)) push(errors, "S001", `${eventPointer}/name`, "event name fails the name format");
          if (eventNamesByThisContract.has(event.name)) {
            push(errors, "S005", eventPointer, `duplicate event name "${event.name}" in contract`);
          }
          eventNamesByThisContract.add(event.name);
        }
      });
    }

    const a11y = contract.a11y;
    if (isPlainObject(a11y)) {
      const label = a11y.label;
      if (isPlainObject(label)) {
        if (label.source === "static" && typeof label.value === "string") {
          if (label.value.length === 0 || label.value.length > 80) {
            push(errors, "S017", `${contractPointer}/a11y/label/value`, "static label value must be 1..80 characters");
          }
        }
        if (label.source === "prop" && typeof label.prop === "string" && Array.isArray(props)) {
          const referenced = props.find(
            (p: unknown) => isPlainObject(p) && p.name === label.prop,
          ) as Record<string, unknown> | undefined;
          if (!referenced || referenced.required !== true || referenced.type !== "string") {
            push(
              errors,
              "S008",
              `${contractPointer}/a11y/label/prop`,
              `label.source="prop" must name a required string prop; "${label.prop}" does not qualify`,
            );
          }
        }
      }
    }
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
