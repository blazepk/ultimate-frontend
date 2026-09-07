// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { reactAdapter } from "../../react";
import { preactAdapter } from "../../preact";
import { vanillaAdapter } from "../../vanilla";
import { svelteAdapter } from "../../svelte";
import { loadSvelteSSR, loadSvelteDOM } from "../../test-utils/svelte-compile";
import ReactHeroCta from "./react";
import PreactHeroCta from "./preact";
import * as VanillaHeroCta from "./vanilla";
import type { SvelteSSRComponent, SvelteDOMComponentConstructor } from "../../svelte";

const svelteFile = join(dirname(fileURLToPath(import.meta.url)), "svelte.svelte");
const props = { heading: "Welcome", cta_label: "Get started" };

function assertA11y(root: Element) {
  expect(root.getAttribute("role")).toBe("region");
  expect(root.getAttribute("aria-label")).toBe("Welcome");
}

describe("hero-cta reference component — renderToString determinism (docs/CONTRACTS.md §6.2)", () => {
  it("react", async () => {
    const html1 = await reactAdapter.renderToString(ReactHeroCta, props);
    const html2 = await reactAdapter.renderToString(ReactHeroCta, props);
    expect(html1).toBe(html2);
    expect(html1).toContain('role="region"');
  });

  it("preact", async () => {
    const html1 = await preactAdapter.renderToString(PreactHeroCta, props);
    const html2 = await preactAdapter.renderToString(PreactHeroCta, props);
    expect(html1).toBe(html2);
    expect(html1).toContain('role="region"');
  });

  it("vanilla", async () => {
    const html1 = await vanillaAdapter.renderToString(VanillaHeroCta, props);
    const html2 = await vanillaAdapter.renderToString(VanillaHeroCta, props);
    expect(html1).toBe(html2);
    expect(html1).toContain('role="region"');
  });

  it("svelte", async () => {
    const Component = await loadSvelteSSR<SvelteSSRComponent>(svelteFile);
    const html1 = await svelteAdapter.renderToString(Component, props);
    const html2 = await svelteAdapter.renderToString(Component, props);
    expect(html1).toBe(html2);
    expect(html1).toContain('role="region"');
  });
});

describe("hero-cta reference component — a11y after hydrate (docs/CONTRACTS.md §6.2 items 1-2)", () => {
  it("react", async () => {
    const container = document.createElement("div");
    container.innerHTML = await reactAdapter.renderToString(ReactHeroCta, props);
    await reactAdapter.hydrate(container, ReactHeroCta, props);
    assertA11y(container.firstElementChild!);
  });

  it("preact", async () => {
    const container = document.createElement("div");
    container.innerHTML = await preactAdapter.renderToString(PreactHeroCta, props);
    await preactAdapter.hydrate(container, PreactHeroCta, props);
    assertA11y(container.firstElementChild!);
  });

  it("vanilla", async () => {
    const container = document.createElement("div");
    container.innerHTML = await vanillaAdapter.renderToString(VanillaHeroCta, props);
    await vanillaAdapter.hydrate(container, VanillaHeroCta, props);
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
