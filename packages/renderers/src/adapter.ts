// RendererAdapter interface and lookup, per docs/CONTRACTS.md §7.1.

import type { Renderer, JsonValue } from "@harness/contracts";

// The default export of a component module (CONTRACTS.md §15 layout). Its
// concrete shape is renderer-private: a React/Preact component function, a
// Svelte component class, or (vanilla) an object
// { render(props): string; attach(el, props): void }.
export type IslandModule = unknown;

export interface RendererAdapter {
  renderer: Renderer;
  // Server/build render of one island to HTML (inner HTML of the wrapper).
  renderToString(module: IslandModule, props: Record<string, JsonValue>): Promise<string>;
  // Attach behavior to existing server-rendered DOM inside `container`.
  hydrate(container: Element, module: IslandModule, props: Record<string, JsonValue>): Promise<void>;
  // Client-render from scratch into an empty `container` (client shells).
  mount(container: Element, module: IslandModule, props: Record<string, JsonValue>): Promise<void>;
}

import { reactAdapter } from "./react";
import { preactAdapter } from "./preact";
import { svelteAdapter } from "./svelte";
import { vanillaAdapter } from "./vanilla";

export const adapters: Record<Renderer, RendererAdapter> = {
  react: reactAdapter,
  preact: preactAdapter,
  svelte: svelteAdapter,
  vanilla: vanillaAdapter,
};

export function getAdapter(renderer: Renderer): RendererAdapter {
  return adapters[renderer];
}
