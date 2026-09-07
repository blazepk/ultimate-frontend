// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { BootSpecWithModule } from "./scheduler";

// scheduler.ts's job is scheduling/timing/state-tracking, not exercising a
// real framework — mock the adapter registry so hydrate/mount behavior is
// fully controllable per test (in particular, to genuinely test the
// HYDRATION_TIMEOUT_MS path, which needs a promise that never settles).
const mockHydrate = vi.fn();
const mockMount = vi.fn();
vi.mock("./adapter", () => ({
  getAdapter: () => ({ renderer: "vanilla", renderToString: vi.fn(), hydrate: mockHydrate, mount: mockMount }),
}));

const { initHarness } = await import("./scheduler");

function makeWrapper(islandId: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-island", islandId);
  document.body.appendChild(el);
  return el;
}

function baseSpec(overrides: Partial<BootSpecWithModule>): BootSpecWithModule {
  return {
    island_id: "i1",
    contract_id: "c1",
    renderer: "vanilla",
    hydration: "load",
    mode: "mount",
    props: {},
    needs_data: false,
    module: {},
    ...overrides,
  } as BootSpecWithModule;
}

const noopOpts = { data_strategy: "none" as const, data_inline: null, data_path: null };

beforeEach(() => {
  document.body.innerHTML = "";
  mockHydrate.mockReset().mockResolvedValue(undefined);
  mockMount.mockReset().mockResolvedValue(undefined);
  vi.useFakeTimers();
  // jsdom does not implement IntersectionObserver.
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    private cb: IntersectionObserverCallback;
    constructor(cb: IntersectionObserverCallback) {
      this.cb = cb;
    }
    observe(target: Element) {
      ioTargets.set(target, this.cb);
    }
    disconnect() {}
  };
  ioTargets.clear();
});

const ioTargets = new Map<Element, IntersectionObserverCallback>();

afterEach(() => {
  vi.useRealTimers();
});

describe("initHarness / scheduler (docs/CONTRACTS.md §7.3, §7.6)", () => {
  it('hydration "none" is never scheduled — no __HARNESS__ entry at all', () => {
    makeWrapper("i1");
    initHarness([baseSpec({ hydration: "none" })], noopOpts);
    expect(window.__HARNESS__.islands.i1).toBeUndefined();
  });

  it('hydration "load" boots immediately: pending -> scheduled -> ready', async () => {
    makeWrapper("i1");
    initHarness([baseSpec({ hydration: "load" })], noopOpts);
    await vi.advanceTimersByTimeAsync(0);
    expect(window.__HARNESS__.islands.i1.status).toBe("ready");
    expect(window.__HARNESS__.islands.i1.triggered_at).not.toBeNull();
    expect(window.__HARNESS__.islands.i1.ready_at).not.toBeNull();
    expect(mockMount).toHaveBeenCalledTimes(1);
  });

  it('hydration "idle" boots after the 200ms fallback (jsdom has no requestIdleCallback)', async () => {
    makeWrapper("i1");
    initHarness([baseSpec({ hydration: "idle" })], noopOpts);
    expect(window.__HARNESS__.islands.i1.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(200);
    expect(window.__HARNESS__.islands.i1.status).toBe("ready");
  });

  it('hydration "visible" boots on first intersection', async () => {
    makeWrapper("i1");
    initHarness([baseSpec({ hydration: "visible" })], noopOpts);
    expect(window.__HARNESS__.islands.i1.status).toBe("pending");
    const wrapper = document.querySelector('[data-island="i1"]')!;
    const cb = ioTargets.get(wrapper)!;
    cb([{ isIntersecting: true, target: wrapper } as IntersectionObserverEntry], null as never);
    await vi.advanceTimersByTimeAsync(0);
    expect(window.__HARNESS__.islands.i1.status).toBe("ready");
  });

  it('hydration "interaction" boots on first pointerdown', async () => {
    makeWrapper("i1");
    initHarness([baseSpec({ hydration: "interaction" })], noopOpts);
    expect(window.__HARNESS__.islands.i1.status).toBe("pending");
    document.querySelector('[data-island="i1"]')!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(window.__HARNESS__.islands.i1.status).toBe("ready");
  });

  it('a rejecting hydrate sets status to "error"', async () => {
    makeWrapper("i1");
    mockMount.mockRejectedValue(new Error("boom"));
    initHarness([baseSpec({ hydration: "load" })], noopOpts);
    await vi.advanceTimersByTimeAsync(0);
    expect(window.__HARNESS__.islands.i1.status).toBe("error");
  });

  it("a hydration that never resolves times out to \"error\" after HYDRATION_TIMEOUT_MS", async () => {
    makeWrapper("i1");
    mockMount.mockReturnValue(new Promise(() => {})); // never settles
    initHarness([baseSpec({ hydration: "load" })], noopOpts);
    await vi.advanceTimersByTimeAsync(0);
    expect(window.__HARNESS__.islands.i1.status).toBe("scheduled");
    await vi.advanceTimersByTimeAsync(10000);
    expect(window.__HARNESS__.islands.i1.status).toBe("error");
  });

  it("tracks window error events in error_count", () => {
    makeWrapper("i1");
    initHarness([baseSpec({ hydration: "none" })], noopOpts);
    expect(window.__HARNESS__.error_count).toBe(0);
    window.dispatchEvent(new Event("error"));
    expect(window.__HARNESS__.error_count).toBe(1);
  });

  it("injects data into props when needs_data is true, for data_strategy=client via fetch(data_path)", async () => {
    makeWrapper("i1");
    globalThis.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ rows: [] }) }) as unknown as typeof fetch;
    initHarness(
      [baseSpec({ hydration: "load", needs_data: true, props: { foo: "bar" } })],
      { data_strategy: "client", data_inline: null, data_path: "/__data/x.json" },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(mockMount).toHaveBeenCalledWith(expect.anything(), expect.anything(), { foo: "bar", data: { rows: [] } });
  });
});
