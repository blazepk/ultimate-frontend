// Test-only helper: compiles a .svelte source file at test-run time, once
// for SSR ("Component.render(props).html", per docs/CONTRACTS.md §7.1) and
// once for the DOM (an instantiable class for hydrate/mount). Real bundler
// pipelines (Stage 4's esbuild-svelte) do this at build time from the same
// source, producing separate server/client artifacts — this reproduces that
// for tests without needing the full bundler.
//
// Compiled output is written under packages/renderers/.svelte-tmp/ (inside
// the package tree, not the OS temp dir) so Node's module resolution can
// still find "svelte/internal" by walking up to this package's node_modules.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { compile } from "svelte/compiler";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, "..", "..", ".svelte-tmp");

// A plain incrementing counter collides across parallel vitest workers (each
// worker starts its own counter at 0, and multiple contract test files write
// into this same shared TMP_DIR concurrently) — whichever compilation wrote
// last silently wins the shared path, so a different contract's component
// ends up imported. A random UUID per compilation guarantees no collision
// regardless of worker parallelism.
function compileTo(svelteFilePath: string, generate: "ssr" | "dom"): string {
  const source = readFileSync(svelteFilePath, "utf-8");
  // hydratable:true is required for "dom" output to include the claim (`.l`)
  // function svelte.ts's `hydrate: true` instantiation option depends on —
  // Svelte 4 omits it by default.
  const { js } = compile(source, { generate, filename: svelteFilePath, css: "injected", hydratable: generate === "dom" });
  mkdirSync(TMP_DIR, { recursive: true });
  const outFile = join(TMP_DIR, `${basename(svelteFilePath, ".svelte")}.${generate}.${randomUUID()}.mjs`);
  writeFileSync(outFile, js.code);
  return outFile;
}

export async function loadSvelteSSR<T>(svelteFilePath: string): Promise<T> {
  const outFile = compileTo(svelteFilePath, "ssr");
  const mod = (await import(pathToFileURL(outFile).href)) as { default: T };
  return mod.default;
}

export async function loadSvelteDOM<T>(svelteFilePath: string): Promise<T> {
  const outFile = compileTo(svelteFilePath, "dom");
  const mod = (await import(pathToFileURL(outFile).href)) as { default: T };
  return mod.default;
}
