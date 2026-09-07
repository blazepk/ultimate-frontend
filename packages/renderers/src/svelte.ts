// Svelte RendererAdapter, per docs/CONTRACTS.md §7.1: "Svelte 4 server
// render is `Component.render(props).html`."
//
// A single .svelte source compiles to different output depending on target
// (ssr vs dom) — the same way a real bundler pipeline (Stage 4's esbuild via
// esbuild-svelte) produces a separate SSR module for server.mjs and a
// separate DOM module for the client assets bundle from the same source.
// `renderToString` expects an SSR-compiled module; `hydrate`/`mount` expect
// a DOM-compiled, instantiable class. The caller (build/measure/scheduler)
// is responsible for loading the right compiled artifact for the call it's
// making — this adapter does not compile .svelte source itself.

import type { RendererAdapter } from "./adapter";
import type { JsonValue } from "@harness/contracts";

export interface SvelteSSRComponent {
  render(props: Record<string, JsonValue>): { html: string; css: { code: string }; head: string };
}

export interface SvelteDOMComponentConstructor {
  new (options: { target: Element; props?: Record<string, JsonValue>; hydrate?: boolean }): unknown;
}

export const svelteAdapter: RendererAdapter = {
  renderer: "svelte",

  async renderToString(module, props) {
    const Component = module as SvelteSSRComponent;
    return Component.render(props).html;
  },

  async hydrate(container, module, props) {
    const Component = module as SvelteDOMComponentConstructor;
    new Component({ target: container, props, hydrate: true });
  },

  async mount(container, module, props) {
    const Component = module as SvelteDOMComponentConstructor;
    new Component({ target: container, props });
  },
};
