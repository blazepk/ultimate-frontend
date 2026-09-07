// Preact RendererAdapter, per docs/CONTRACTS.md §7.1. The Preact IslandModule
// shape is a function component: (props) => VNode.
//
// Preact bundles client-side render/hydrate but NOT server rendering —
// SSR normally comes from the separate `preact-render-to-string` package,
// which is not among this stage's permitted dependencies
// (STAGE_INPUTS.md's Stage 3 "New deps" row lists only
// react@18/react-dom@18/preact@10/svelte@4 + jsdom/vite-plugin-svelte).
// `renderToString` below is therefore a small custom VNode-to-HTML renderer,
// scoped to the plain intrinsic elements + text + simple attributes these
// reference components actually use — not a general-purpose Preact SSR
// implementation.

import { render, hydrate as preactHydrate } from "preact";
import type { RendererAdapter } from "./adapter";
import type { JsonValue } from "@harness/contracts";

export type PreactComponent = (props: Record<string, JsonValue>) => unknown;

interface VNode {
  type: unknown;
  props: Record<string, unknown>;
}

function isVNode(v: unknown): v is VNode {
  return typeof v === "object" && v !== null && "type" in v && "props" in v;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ATTR_NAME_MAP: Record<string, string> = { className: "class", htmlFor: "for" };

function attrToHtml(name: string, value: unknown): string {
  if (name.startsWith("on") || name === "key" || name === "ref" || name === "children") return "";
  const htmlName = ATTR_NAME_MAP[name] ?? name;
  if (value === true) return ` ${htmlName}`;
  if (value === false || value === null || value === undefined) return "";
  return ` ${htmlName}="${escapeHtml(String(value))}"`;
}

const VOID_ELEMENTS = new Set(["br", "hr", "img", "input", "meta", "link"]);

function renderVNodeToString(vnode: unknown): string {
  if (vnode === null || vnode === undefined || typeof vnode === "boolean") return "";
  if (typeof vnode === "string" || typeof vnode === "number") return escapeHtml(String(vnode));
  if (Array.isArray(vnode)) return vnode.map(renderVNodeToString).join("");
  if (!isVNode(vnode)) return "";

  if (typeof vnode.type === "function") {
    return renderVNodeToString((vnode.type as PreactComponent)(vnode.props as Record<string, JsonValue>));
  }
  if (typeof vnode.type === "string") {
    const { children, ...rest } = vnode.props ?? {};
    const attrs = Object.entries(rest)
      .map(([k, v]) => attrToHtml(k, v))
      .join("");
    if (VOID_ELEMENTS.has(vnode.type)) return `<${vnode.type}${attrs}/>`;
    return `<${vnode.type}${attrs}>${renderVNodeToString(children)}</${vnode.type}>`;
  }
  return "";
}

export const preactAdapter: RendererAdapter = {
  renderer: "preact",

  async renderToString(module, props) {
    const Component = module as PreactComponent;
    return renderVNodeToString(Component(props));
  },

  async hydrate(container, module, props) {
    const Component = module as PreactComponent;
    preactHydrate(Component(props) as never, container);
  },

  async mount(container, module, props) {
    const Component = module as PreactComponent;
    render(Component(props) as never, container);
  },
};
