import { describe, it, expect } from "vitest";
import { adapters, getAdapter } from "./adapter";
import type { Renderer } from "@harness/contracts";

const RENDERERS: Renderer[] = ["react", "preact", "svelte", "vanilla"];

describe("adapter registry (docs/CONTRACTS.md §7.1)", () => {
  it("has exactly the four frozen renderers, each with a matching adapter", () => {
    expect(Object.keys(adapters).sort()).toEqual([...RENDERERS].sort());
    for (const renderer of RENDERERS) {
      expect(adapters[renderer].renderer).toBe(renderer);
    }
  });

  it("getAdapter looks up by Renderer", () => {
    for (const renderer of RENDERERS) {
      expect(getAdapter(renderer)).toBe(adapters[renderer]);
    }
  });

  it("every adapter implements renderToString/hydrate/mount", () => {
    for (const renderer of RENDERERS) {
      const adapter = adapters[renderer];
      expect(typeof adapter.renderToString).toBe("function");
      expect(typeof adapter.hydrate).toBe("function");
      expect(typeof adapter.mount).toBe("function");
    }
  });

  it("vanilla adapter's renderToString is pure: same props -> same HTML", async () => {
    const module = {
      render: (props: Record<string, unknown>) => `<span>${props.label}</span>`,
      attach: () => {},
    };
    const html1 = await adapters.vanilla.renderToString(module, { label: "x" });
    const html2 = await adapters.vanilla.renderToString(module, { label: "x" });
    expect(html1).toBe(html2);
    expect(html1).toBe("<span>x</span>");
  });
});
