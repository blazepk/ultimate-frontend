// Validator per docs/CONTRACTS.md §5.4: checks S001–S005, S011, S012,
// S014–S018 (structural, §5.2) and C001–C004 (combination, §4.1, reusing
// `checkConstraints` — not re-derived here). S006–S010, S013, C005 need
// IslandContract data and are @harness/islands's job (§5.4
// `validateWithContracts`), not this function's.

import type { ValidationError, ErrorCode } from "./types";
import {
  checkStaticShellRequestData,
  checkClientShellRequestData,
  checkClientShellDeadIsland,
  checkUnhydratedClientData,
} from "./constraints";
import type { PlacementTuple } from "./constraints";

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PATH_RE = /^\/$|^(\/([a-z0-9-]+|:[a-z0-9_]+))+$/;
const DATA_URL_RE = /^\.\/[a-z0-9_\-/.]+\.json$/;

const BUDGET_KEYS = ["lcp_ms", "cls", "tbt_ms", "ttfb_ms", "js_bytes", "html_bytes", "hydration_ms"] as const;

function push(errors: ValidationError[], code: ErrorCode, pointer: string, message: string): void {
  errors.push({ code, pointer, message });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// CONTRACTS.md §5.4: function validate(config: unknown): ValidationError[]
export function validate(config: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!isPlainObject(config)) {
    push(errors, "S016", "/schema_version", "config is not an object");
    return sortErrors(errors);
  }

  if (config.schema_version !== 1) {
    push(errors, "S016", "/schema_version", "schema_version must be exactly 1");
  }

  if (typeof config.site_id === "string" && !ID_RE.test(config.site_id)) {
    push(errors, "S001", "/site_id", "site_id fails the authored-ID format");
  }

  const routes = config.routes;
  if (!Array.isArray(routes)) {
    push(errors, "S015", "/routes", "routes is not an array");
    return sortErrors(errors);
  }
  if (routes.length === 0) {
    push(errors, "S015", "/routes", "routes must contain at least one route");
  }

  const seenRouteIds = new Set<string>();
  const seenPaths = new Set<string>();

  routes.forEach((route: unknown, routeIndex: number) => {
    const routePointer = `/routes/${routeIndex}`;
    if (!isPlainObject(route)) return;

    if (typeof route.route_id === "string") {
      if (!ID_RE.test(route.route_id)) {
        push(errors, "S001", `${routePointer}/route_id`, "route_id fails the authored-ID format");
      }
      if (seenRouteIds.has(route.route_id)) {
        push(errors, "S002", routePointer, `duplicate route_id "${route.route_id}"`);
      }
      seenRouteIds.add(route.route_id);
    }

    if (typeof route.path === "string") {
      if (!PATH_RE.test(route.path)) {
        push(errors, "S004", `${routePointer}/path`, "path fails the path grammar");
      }
      if (seenPaths.has(route.path)) {
        push(errors, "S003", routePointer, `duplicate path "${route.path}"`);
      }
      seenPaths.add(route.path);
    }

    if (typeof route.title === "string") {
      if (route.title.length === 0 || route.title.length > 80) {
        push(errors, "S017", `${routePointer}/title`, "title must be 1..80 characters");
      }
    }

    const dataStrategy = route.data_strategy;
    const dataUrl = route.data_url;
    if (dataStrategy !== "none" && dataUrl === null) {
      push(errors, "S011", routePointer, "data_url is required when data_strategy is not \"none\"");
    }
    if (dataStrategy === "none" && dataUrl !== null && dataUrl !== undefined) {
      push(errors, "S012", routePointer, "data_url must be null when data_strategy is \"none\"");
    }
    if (typeof dataUrl === "string" && !DATA_URL_RE.test(dataUrl)) {
      push(errors, "S018", `${routePointer}/data_url`, "data_url fails the data-url grammar");
    }

    if (isPlainObject(route.budgets)) {
      for (const key of BUDGET_KEYS) {
        const value = (route.budgets as Record<string, unknown>)[key];
        if (typeof value === "number" && value <= 0) {
          push(errors, "S014", `${routePointer}/budgets/${key}`, `budget ${key} must be > 0`);
        }
      }
    }

    // C001/C002 (CONTRACTS.md §4.1) involve only route fields (render_mode,
    // data_strategy) and are reported ONCE per route at the route pointer —
    // not once per island. renderer/hydration are unused by these two
    // predicates; filler values satisfy PlacementTuple's shape only.
    if (typeof route.render_mode === "string" && typeof route.data_strategy === "string") {
      const routeTuple: PlacementTuple = {
        renderer: "react",
        hydration: "load",
        render_mode: route.render_mode as PlacementTuple["render_mode"],
        data_strategy: route.data_strategy as PlacementTuple["data_strategy"],
      };
      if (checkStaticShellRequestData(routeTuple)) push(errors, "C001", routePointer, "constraint C001 violated");
      if (checkClientShellRequestData(routeTuple)) push(errors, "C002", routePointer, "constraint C002 violated");
    }

    // C003/C004 involve island fields (hydration) and are reported per
    // island at the island's pointer.
    const islands = route.islands;
    if (Array.isArray(islands)) {
      const seenIslandIds = new Set<string>();
      islands.forEach((island: unknown, islandIndex: number) => {
        const islandPointer = `${routePointer}/islands/${islandIndex}`;
        if (!isPlainObject(island)) return;

        if (typeof island.island_id === "string") {
          if (!ID_RE.test(island.island_id)) {
            push(errors, "S001", `${islandPointer}/island_id`, "island_id fails the authored-ID format");
          }
          if (seenIslandIds.has(island.island_id)) {
            push(errors, "S005", islandPointer, `duplicate island_id "${island.island_id}"`);
          }
          seenIslandIds.add(island.island_id);
        }

        if (typeof island.contract_id === "string" && !ID_RE.test(island.contract_id)) {
          push(errors, "S001", `${islandPointer}/contract_id`, "contract_id fails the authored-ID format");
        }

        if (
          typeof island.renderer === "string" &&
          typeof island.hydration === "string" &&
          typeof route.render_mode === "string" &&
          typeof route.data_strategy === "string"
        ) {
          const islandTuple: PlacementTuple = {
            renderer: island.renderer as PlacementTuple["renderer"],
            hydration: island.hydration as PlacementTuple["hydration"],
            render_mode: route.render_mode as PlacementTuple["render_mode"],
            data_strategy: route.data_strategy as PlacementTuple["data_strategy"],
          };
          if (checkClientShellDeadIsland(islandTuple)) push(errors, "C003", islandPointer, "constraint C003 violated");
          if (checkUnhydratedClientData(islandTuple)) push(errors, "C004", islandPointer, "constraint C004 violated");
        }
      });
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
