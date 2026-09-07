// Client scheduler, per docs/CONTRACTS.md §7.3, §7.6.

import type { DataStrategy, Hydration, JsonValue, Renderer } from "@harness/contracts";
import { getAdapter, type IslandModule } from "./adapter";

export interface IslandBootSpec {
  island_id: string;
  contract_id: string;
  renderer: Renderer;
  hydration: Hydration; // "none" islands are never included in boot specs
  mode: "hydrate" | "mount"; // mount when route render_mode = "client"
  props: Record<string, JsonValue>; // static props; `data` NOT included
  needs_data: boolean; // true iff contract declares a `data` prop
}

// docs/OPEN_QUESTIONS.md: CONTRACTS.md §7.3 does not specify how the
// scheduler obtains each island's actual JS module reference to pass to
// `adapter.hydrate`/`mount` — a genuine gap, not a contradiction. Most
// conservative reading: extend `IslandBootSpec` additively with the module
// the caller (the per-route bundle Stage 4 generates) already holds a
// direct reference to; every frozen field is unchanged.
export interface BootSpecWithModule extends IslandBootSpec {
  module: IslandModule;
}

export interface HarnessRuntimeState {
  islands: Record<
    string,
    {
      status: "pending" | "scheduled" | "ready" | "error";
      triggered_at: number | null;
      ready_at: number | null;
    }
  >;
  error_count: number;
}

declare global {
  interface Window {
    __HARNESS__: HarnessRuntimeState;
  }
}

const HYDRATION_TIMEOUT_MS = 10000; // CONTRACTS.md §1.4
const IDLE_FALLBACK_MS = 200; // CONTRACTS.md §2 idle semantics

function resolveData(opts: {
  data_strategy: DataStrategy;
  data_inline: JsonValue | null;
  data_path: string | null;
}): Promise<JsonValue | null> {
  if (opts.data_strategy === "client") {
    if (!opts.data_path) return Promise.resolve(null);
    return fetch(opts.data_path).then((r) => r.json());
  }
  return Promise.resolve(opts.data_inline);
}

async function boot(
  spec: BootSpecWithModule,
  wrapper: Element,
  state: HarnessRuntimeState,
  dataPromise: Promise<JsonValue | null>,
): Promise<void> {
  const record = state.islands[spec.island_id];
  record.status = "scheduled";
  record.triggered_at = performance.now();

  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    if (record.status === "scheduled") record.status = "error";
  }, HYDRATION_TIMEOUT_MS);

  try {
    let props = spec.props;
    if (spec.needs_data) {
      const data = await dataPromise;
      props = { ...props, data };
    }
    const adapter = getAdapter(spec.renderer);
    if (spec.mode === "hydrate") {
      await adapter.hydrate(wrapper, spec.module, props);
    } else {
      await adapter.mount(wrapper, spec.module, props);
    }
    clearTimeout(timeoutHandle);
    if (!timedOut) {
      record.status = "ready";
      record.ready_at = performance.now();
    }
  } catch {
    clearTimeout(timeoutHandle);
    if (!timedOut) record.status = "error";
  }
}

function scheduleIsland(spec: BootSpecWithModule, state: HarnessRuntimeState, dataPromise: Promise<JsonValue | null>): void {
  state.islands[spec.island_id] = { status: "pending", triggered_at: null, ready_at: null };

  const wrapper = document.querySelector(`[data-island="${spec.island_id}"]`);
  if (!wrapper) return;

  const trigger = () => {
    void boot(spec, wrapper, state, dataPromise);
  };

  switch (spec.hydration) {
    case "none":
      return; // never boots
    case "load":
      trigger();
      return;
    case "idle":
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(trigger, { timeout: IDLE_FALLBACK_MS });
      } else {
        setTimeout(trigger, IDLE_FALLBACK_MS);
      }
      return;
    case "visible": {
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.disconnect();
            trigger();
          }
        }
      });
      observer.observe(wrapper);
      return;
    }
    case "interaction": {
      const onFirst = () => {
        wrapper.removeEventListener("pointerdown", onFirst);
        wrapper.removeEventListener("focusin", onFirst);
        trigger();
      };
      wrapper.addEventListener("pointerdown", onFirst, { once: true });
      wrapper.addEventListener("focusin", onFirst, { once: true });
      return;
    }
  }
}

// CONTRACTS.md §7.3 — function initHarness(specs, opts): void
export function initHarness(
  specs: BootSpecWithModule[],
  opts: { data_strategy: DataStrategy; data_inline: JsonValue | null; data_path: string | null },
): void {
  const state: HarnessRuntimeState = { islands: {}, error_count: 0 };
  window.__HARNESS__ = state;

  window.addEventListener("error", () => {
    state.error_count++;
  });
  window.addEventListener("unhandledrejection", () => {
    state.error_count++;
  });

  const dataPromise = resolveData(opts);
  for (const spec of specs) {
    if (spec.hydration === "none") continue;
    scheduleIsland(spec, state, dataPromise);
  }
}
