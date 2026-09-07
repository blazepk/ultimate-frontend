// Validator for docs/CONTRACTS.md §4.1 (the combination constraint table:
// C001-C004). §4.3's C005 is contract-dependent (needs IslandContract event
// declarations) and is checked by @harness/islands, not here — see
// docs/OPEN_QUESTIONS.md #7 and docs/RECONCILIATION.md §E.4.

import type { Renderer, Hydration, RenderMode, DataStrategy, ErrorCode } from "./types";

const RENDERERS: readonly Renderer[] = ["react", "preact", "svelte", "vanilla"];
const HYDRATIONS: readonly Hydration[] = ["none", "load", "idle", "visible", "interaction"];
const RENDER_MODES: readonly RenderMode[] = ["static", "server", "client"];
const DATA_STRATEGIES: readonly DataStrategy[] = ["none", "static", "request", "client"];

// The placement tuple of an island (CONTRACTS.md §4).
export interface PlacementTuple {
  renderer: Renderer;
  hydration: Hydration;
  render_mode: RenderMode;
  data_strategy: DataStrategy;
}

function isPlacementTuple(value: unknown): value is PlacementTuple {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    RENDERERS.includes(t.renderer as Renderer) &&
    HYDRATIONS.includes(t.hydration as Hydration) &&
    RENDER_MODES.includes(t.render_mode as RenderMode) &&
    DATA_STRATEGIES.includes(t.data_strategy as DataStrategy)
  );
}

// C001 STATIC_SHELL_REQUEST_DATA — render_mode = static ∧ data_strategy = request
export function checkStaticShellRequestData(t: PlacementTuple): boolean {
  return t.render_mode === "static" && t.data_strategy === "request";
}

// C002 CLIENT_SHELL_REQUEST_DATA — render_mode = client ∧ data_strategy = request
export function checkClientShellRequestData(t: PlacementTuple): boolean {
  return t.render_mode === "client" && t.data_strategy === "request";
}

// C003 CLIENT_SHELL_DEAD_ISLAND — render_mode = client ∧ hydration = none
export function checkClientShellDeadIsland(t: PlacementTuple): boolean {
  return t.render_mode === "client" && t.hydration === "none";
}

// C004 UNHYDRATED_CLIENT_DATA — hydration = none ∧ data_strategy = client
export function checkUnhydratedClientData(t: PlacementTuple): boolean {
  return t.hydration === "none" && t.data_strategy === "client";
}

// Set semantics (CONTRACTS.md §4.1): every matching predicate is reported,
// not just the first. Rejects (throws), rather than coerces, an input whose
// fields are not members of their closed enums.
export function checkConstraints(input: unknown): ErrorCode[] {
  if (!isPlacementTuple(input)) {
    throw new TypeError(
      "checkConstraints: input is not a valid placement tuple (missing field or value outside its closed enum)",
    );
  }
  const codes: ErrorCode[] = [];
  if (checkStaticShellRequestData(input)) codes.push("C001");
  if (checkClientShellRequestData(input)) codes.push("C002");
  if (checkClientShellDeadIsland(input)) codes.push("C003");
  if (checkUnhydratedClientData(input)) codes.push("C004");
  return codes;
}
