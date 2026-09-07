import { describe, it, expect } from "vitest";
import {
  checkConstraints,
  checkStaticShellRequestData,
  checkClientShellRequestData,
  checkClientShellDeadIsland,
  checkUnhydratedClientData,
  type PlacementTuple,
} from "./constraints";

const legal: PlacementTuple = {
  renderer: "react",
  hydration: "load",
  render_mode: "server",
  data_strategy: "static",
};

describe("constraint predicates (docs/CONTRACTS.md §4.1 deny list)", () => {
  it("C001 STATIC_SHELL_REQUEST_DATA fires on static + request", () => {
    const t: PlacementTuple = { ...legal, render_mode: "static", data_strategy: "request" };
    expect(checkStaticShellRequestData(t)).toBe(true);
    expect(checkConstraints(t)).toEqual(["C001"]);
  });

  it("C002 CLIENT_SHELL_REQUEST_DATA fires on client + request", () => {
    const t: PlacementTuple = { ...legal, render_mode: "client", data_strategy: "request", hydration: "load" };
    expect(checkClientShellRequestData(t)).toBe(true);
    expect(checkConstraints(t)).toEqual(["C002"]);
  });

  it("C003 CLIENT_SHELL_DEAD_ISLAND fires on client + hydration none", () => {
    const t: PlacementTuple = { ...legal, render_mode: "client", hydration: "none", data_strategy: "static" };
    expect(checkClientShellDeadIsland(t)).toBe(true);
    expect(checkConstraints(t)).toEqual(["C003"]);
  });

  it("C004 UNHYDRATED_CLIENT_DATA fires on hydration none + client data", () => {
    const t: PlacementTuple = { ...legal, hydration: "none", data_strategy: "client", render_mode: "server" };
    expect(checkUnhydratedClientData(t)).toBe(true);
    expect(checkConstraints(t)).toEqual(["C004"]);
  });

  it("a legal tuple matches no constraint", () => {
    expect(checkConstraints(legal)).toEqual([]);
  });

  it("reports every matching code under set semantics, not just the first (C002 ∩ C003)", () => {
    const t: PlacementTuple = {
      renderer: "react",
      render_mode: "client",
      hydration: "none",
      data_strategy: "request",
    };
    expect(checkConstraints(t)).toEqual(["C002", "C003"]);
  });

  it("rejects an unknown enum value rather than coercing it", () => {
    const bad = { renderer: "react", hydration: "load", render_mode: "edge", data_strategy: "static" };
    expect(() => checkConstraints(bad)).toThrow(TypeError);
  });

  it("rejects a tuple missing a required field", () => {
    const bad = { renderer: "react", hydration: "load", render_mode: "static" };
    expect(() => checkConstraints(bad)).toThrow(TypeError);
  });
});
