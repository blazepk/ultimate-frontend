// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reactAdapter } from "../../react";
import { preactAdapter } from "../../preact";
import { vanillaAdapter } from "../../vanilla";
import { svelteAdapter } from "../../svelte";
import { loadSvelteSSR, loadSvelteDOM } from "../../test-utils/svelte-compile";
import ReactDataTable from "./react";
import PreactDataTable from "./preact";
import * as VanillaDataTable from "./vanilla";
import type { SvelteSSRComponent, SvelteDOMComponentConstructor } from "../../svelte";

const svelteFile = join(dirname(fileURLToPath(import.meta.url)), "svelte.svelte");
const props = { data: { rows: [{ sku: "a-1", name: "Alpha", price: 10 }] }, page_size: 10 };

function assertA11y(root: Element) {
  expect(root.getAttribute("role")).toBe("region");
  expect(root.getAttribute("aria-label")).toBe("Results table");
}

describe("data-table reference component — renderToString determinism (docs/CONTRACTS.md §6.2)", () => {
  it("react", async () => {
    const html1 = await reactAdapter.renderToString(ReactDataTable, props);
    const html2 = await reactAdapter.renderToString(ReactDataTable, props);
    expect(html1).toBe(html2);
    expect(html1).toContain('role="region"');
    expect(html1).toContain("Alpha");
  });

  it("preact", async () => {
    const html1 = await preactAdapter.renderToString(PreactDataTable, props);
    const html2 = await preactAdapter.renderToString(PreactDataTable, props);
    expect(html1).toBe(html2);
    expect(html1).toContain('role="region"');
    expect(html1).toContain("Alpha");
  });

  it("vanilla", async () => {
    const html1 = await vanillaAdapter.renderToString(VanillaDataTable, props);
    const html2 = await vanillaAdapter.renderToString(VanillaDataTable, props);
    expect(html1).toBe(html2);
    expect(html1).toContain('role="region"');
    expect(html1).toContain("Alpha");
  });

  it("svelte", async () => {
    const Component = await loadSvelteSSR<SvelteSSRComponent>(svelteFile);
    const html1 = await svelteAdapter.renderToString(Component, props);
    const html2 = await svelteAdapter.renderToString(Component, props);
    expect(html1).toBe(html2);
    expect(html1).toContain('role="region"');
    expect(html1).toContain("Alpha");
  });
});

describe("data-table reference component — a11y after hydrate (docs/CONTRACTS.md §6.2 items 1-2)", () => {
  it("react", async () => {
    const container = document.createElement("div");
    container.innerHTML = await reactAdapter.renderToString(ReactDataTable, props);
    await reactAdapter.hydrate(container, ReactDataTable, props);
    assertA11y(container.firstElementChild!);
  });

  it("preact", async () => {
    const container = document.createElement("div");
    container.innerHTML = await preactAdapter.renderToString(PreactDataTable, props);
    await preactAdapter.hydrate(container, PreactDataTable, props);
    assertA11y(container.firstElementChild!);
  });

  it("vanilla", async () => {
    const container = document.createElement("div");
    container.innerHTML = await vanillaAdapter.renderToString(VanillaDataTable, props);
    await vanillaAdapter.hydrate(container, VanillaDataTable, props);
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
