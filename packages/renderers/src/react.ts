// React RendererAdapter, per docs/CONTRACTS.md §7.1. The React IslandModule
// shape is a function component: (props) => JSX element.

import { createElement } from "react";
import { renderToString as reactRenderToString } from "react-dom/server";
import { createRoot, hydrateRoot } from "react-dom/client";
import type { RendererAdapter } from "./adapter";
import type { JsonValue } from "@harness/contracts";

export type ReactComponent = (props: Record<string, JsonValue>) => unknown;

export const reactAdapter: RendererAdapter = {
  renderer: "react",

  async renderToString(module, props) {
    const Component = module as ReactComponent;
    return reactRenderToString(createElement(Component, props));
  },

  async hydrate(container, module, props) {
    const Component = module as ReactComponent;
    hydrateRoot(container, createElement(Component, props));
  },

  async mount(container, module, props) {
    const Component = module as ReactComponent;
    createRoot(container).render(createElement(Component, props));
  },
};
