// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reactAdapter } from "../../react";
import { preactAdapter } from "../../preact";
import { vanillaAdapter } from "../../vanilla";
import { svelteAdapter } from "../../svelte";
import { loadSvelteSSR, loadSvelteDOM } from "../../test-utils/svelte-compile";
import ReactNavMenu from "./react";
import PreactNavMenu from "./preact";
import * as VanillaNavMenu from "./vanilla";
import type { SvelteSSRComponent, SvelteDOMComponentConstructor } from "../../svelte";

const svelteFile = join(dirname(fileURLToPath(import.meta.url)), "svelte.svelte");
const props = { items: [{ label: "Home", href: "/" }, { label: "Catalog", href: "/catalog" }] };

function assertA11y(root: Element) {
  expect(root.getAttribute("role")).toBe("navigation");
  expect(root.getAttribute("aria-label")).toBe("Main navigation");
}

describe("nav-menu reference component — renderToString determinism (docs/CONTRACTS.md §6.2)", () => {
  it("react", async () => {
    const html1 = await reactAdapter.renderToString(ReactNavMenu, props);
    const html2 = await reactAdapter.renderToString(ReactNavMenu, props);
    expect(html1).toBe(html2);
    expect(html1).toContain('role="navigation"');
  });

  it("preact", async () => {
    const html1 = await preactAdapter.renderToString(PreactNavMenu, props);
    const html2 = await preactAdapter.renderToString(PreactNavMenu, props);
    expect(html1).toBe(html2);
    expect(html1).toContain('role="navigation"');
  });

  it("vanilla", async () => {
    const html1 = await vanillaAdapter.renderToString(VanillaNavMenu, props);
    const html2 = await vanillaAdapter.renderToString(VanillaNavMenu, props);
    expect(html1).toBe(html2);
    expect(html1).toContain('role="navigation"');
  });

  it("svelte", async () => {
    const Component = await loadSvelteSSR<SvelteSSRComponent>(svelteFile);
    const html1 = await svelteAdapter.renderToString(Component, props);
    const html2 = await svelteAdapter.renderToString(Component, props);
    expect(html1).toBe(html2);
    expect(html1).toContain('role="navigation"');
  });
});

describe("nav-menu reference component — a11y after hydrate (docs/CONTRACTS.md §6.2 items 1-2)", () => {
  it("react", async () => {
    const container = document.createElement("div");
    container.innerHTML = await reactAdapter.renderToString(ReactNavMenu, props);
    await reactAdapter.hydrate(container, ReactNavMenu, props);
    assertA11y(container.firstElementChild!);
  });

  it("preact", async () => {
    const container = document.createElement("div");
    container.innerHTML = await preactAdapter.renderToString(PreactNavMenu, props);
    await preactAdapter.hydrate(container, PreactNavMenu, props);
    assertA11y(container.firstElementChild!);
  });

  it("vanilla", async () => {
    const container = document.createElement("div");
    container.innerHTML = await vanillaAdapter.renderToString(VanillaNavMenu, props);
    await vanillaAdapter.hydrate(container, VanillaNavMenu, props);
    assertA11y(container.firstElementChild!);
  });

  it("svelte", async () => {
    const container = document.createElement("div");
    const SSRComponent = await loadSvelteSSR<SvelteSSRComponent>(svelteFile);
    container.innerHTML = SSRComponent.render(props).html;
    const DOMComponent = await loadSvelteDOM<SvelteDOMComponentConstructor>(svelteFile);
    await svelteAdapter.hydrate(container, DOMComponent, props);
    assertA11y(container.firstElementChild!);
  });
});
