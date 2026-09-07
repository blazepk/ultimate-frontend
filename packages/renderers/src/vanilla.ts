// Vanilla RendererAdapter, per docs/CONTRACTS.md §7.1: the vanilla
// IslandModule shape is `{ render(props): string; attach(el, props): void }`.

import type { RendererAdapter } from "./adapter";
import type { JsonValue } from "@harness/contracts";

export interface VanillaModule {
  render(props: Record<string, JsonValue>): string;
  attach(el: Element, props: Record<string, JsonValue>): void;
}

export const vanillaAdapter: RendererAdapter = {
  renderer: "vanilla",

  async renderToString(module, props) {
    return (module as VanillaModule).render(props);
  },

  async hydrate(container, module, props) {
    // Server-rendered inner HTML is already in `container`; only wire behavior.
    (module as VanillaModule).attach(container, props);
  },

  async mount(container, module, props) {
    const m = module as VanillaModule;
    container.innerHTML = m.render(props);
    m.attach(container, props);
  },
};
