// Build pipeline per docs/CONTRACTS.md §9.2, §7.5.

import { build as esbuildBuild } from "esbuild";
import sveltePlugin from "esbuild-svelte";
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import type { BuildProfile, ResolvedRouteConfig, IslandConfig, IslandContract, JsonValue, Renderer } from "@harness/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const TMP_DIR = join(__dirname, "..", ".build-tmp");

export interface BuildManifest {
  schema_version: 1;
  profile_id: string;
  built_at: string;
  routes: {
    route_id: string;
    path: string;
    render_mode: ResolvedRouteConfig["render_mode"];
    html_file: string | null;
    server_file: string;
    data_strategy: ResolvedRouteConfig["data_strategy"];
    js_files: { file: string; bytes: number }[];
    data_file: string | null;
  }[];
}

interface RegistryFile {
  schema_version: 1;
  implementations: { contract_id: string; renderer: Renderer; module: string }[];
}
interface ContractsFile {
  schema_version: 1;
  contracts: IslandContract[];
}

function loadContracts(): IslandContract[] {
  const raw = readFileSync(join(REPO_ROOT, "islands", "contracts.json"), "utf-8");
  return (JSON.parse(raw) as ContractsFile).contracts;
}
function loadRegistry(): RegistryFile["implementations"] {
  const raw = readFileSync(join(REPO_ROOT, "islands", "registry.json"), "utf-8");
  return (JSON.parse(raw) as RegistryFile).implementations;
}
function findModulePath(registry: RegistryFile["implementations"], contractId: string, renderer: Renderer): string {
  const entry = registry.find((e) => e.contract_id === contractId && e.renderer === renderer);
  if (!entry) throw new Error(`build: no registry entry for (${contractId}, ${renderer})`);
  return join(REPO_ROOT, entry.module.replace(/^\.\//, ""));
}
function contractOf(contracts: IslandContract[], contractId: string): IslandContract {
  const c = contracts.find((c) => c.contract_id === contractId);
  if (!c) throw new Error(`build: unknown contract_id "${contractId}"`);
  return c;
}
function needsData(contract: IslandContract): boolean {
  return contract.props.some((p) => p.name === "data");
}

function wrapperHtml(island: IslandConfig, inner: string): string {
  return `<div data-island="${island.island_id}" data-contract="${island.contract_id}" data-renderer="${island.renderer}" data-hydration="${island.hydration}">${inner}</div>`;
}

// docs/OPEN_QUESTIONS.md: §7.5's fixed shell has no slot for the route's
// data value to reach the client bundle for data_strategy static/request
// (only "client" strategy fetches; static/request need the value some other
// way). Conservative, additive reading: an inline script tag carrying the
// resolved data as window.__ROUTE_DATA__, placed before the module script.
// Does not remove or alter any element §7.5 does specify.
function shellHtml(route: ResolvedRouteConfig, wrappers: string, scriptSrc: string | null, dataInline: JsonValue | null): string {
  const dataScript = dataInline !== null ? `<script>window.__ROUTE_DATA__=${JSON.stringify(dataInline)};</script>` : "";
  const moduleScript = scriptSrc ? `<script type="module" src="${scriptSrc}"></script>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${route.title}</title></head><body><main>${wrappers}</main>${dataScript}${moduleScript}</body></html>`;
}

function bootableIslands(route: ResolvedRouteConfig): IslandConfig[] {
  return route.islands.filter((i) => i.hydration !== "none");
}

async function bundleToFile(entrySource: string, outFile: string, platform: "node" | "browser", svelteGenerate: "ssr" | "dom"): Promise<void> {
  mkdirSync(TMP_DIR, { recursive: true });
  const entryFile = join(TMP_DIR, `entry-${randomUUID()}.ts`);
  writeFileSync(entryFile, entrySource);
  mkdirSync(dirname(outFile), { recursive: true });
  await esbuildBuild({
    entryPoints: [entryFile],
    outfile: outFile,
    bundle: true,
    format: "esm",
    platform,
    jsx: "automatic",
    write: true,
    plugins: [sveltePlugin({ compilerOptions: { generate: svelteGenerate, hydratable: svelteGenerate === "dom" } })],
  });
  rmSync(entryFile, { force: true });
}

function generateServerEntry(route: ResolvedRouteConfig, registry: RegistryFile["implementations"], contracts: IslandContract[]): string {
  if (route.render_mode === "client") {
    const wrappers = route.islands.map((i) => wrapperHtml(i, "")).join("");
    // A "client" route always gets a client bundle (§9.2: js_files is
    // present "iff ... render_mode = client"), so the script tag must always
    // point at it — omitting it (as an earlier draft did) left every client
    // island permanently empty, since the bundle that mounts them never
    // loaded.
    const scriptSrc = `../assets/${route.route_id}.js`;
    return `export default async function render(data) {\n  return ${JSON.stringify(shellHtml(route, wrappers, scriptSrc, null))};\n}\n`;
  }

  const imports: string[] = [];
  const renderCalls: string[] = [];
  route.islands.forEach((island, idx) => {
    const contract = contractOf(contracts, island.contract_id);
    const modulePath = findModulePath(registry, island.contract_id, island.renderer);
    // The vanilla IslandModule shape (CONTRACTS §7.1) is a plain object
    // { render, attach } — the vanilla components export those as named
    // exports, not a default export, so a namespace import is what actually
    // produces that shape. React/preact/svelte components have real default
    // exports (a function component / component class).
    imports.push(
      island.renderer === "vanilla"
        ? `import * as Island${idx} from ${JSON.stringify(modulePath)};`
        : `import Island${idx} from ${JSON.stringify(modulePath)};`,
    );
    imports.push(`import { ${island.renderer}Adapter } from "@harness/renderers/${island.renderer}";`);
    const propsExpr = needsData(contract)
      ? `{ ...${JSON.stringify(island.props)}, data }`
      : JSON.stringify(island.props);
    renderCalls.push(`const inner${idx} = await ${island.renderer}Adapter.renderToString(Island${idx}, ${propsExpr});`);
  });

  const wrapperExprs = route.islands
    .map((island, idx) => `\`<div data-island="${island.island_id}" data-contract="${island.contract_id}" data-renderer="${island.renderer}" data-hydration="${island.hydration}">\${inner${idx}}</div>\``)
    .join(" + ");

  const hasBootable = bootableIslands(route).length > 0;
  const scriptSrc = hasBootable ? `"../assets/${route.route_id}.js"` : "null";
  const dataInlineExpr = route.data_strategy === "static" || route.data_strategy === "request" ? "data" : "null";

  return `${imports.join("\n")}

function shell(wrappers, scriptSrc, dataInline) {
  const dataScript = dataInline !== null ? \`<script>window.__ROUTE_DATA__=\${JSON.stringify(dataInline)};</script>\` : "";
  const moduleScript = scriptSrc ? \`<script type="module" src="\${scriptSrc}"></script>\` : "";
  return \`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${route.title}</title></head><body><main>\${wrappers}</main>\${dataScript}\${moduleScript}</body></html>\`;
}

export default async function render(data) {
  ${renderCalls.join("\n  ")}
  const wrappers = ${route.islands.length > 0 ? wrapperExprs : '""'};
  return shell(wrappers, ${scriptSrc}, ${dataInlineExpr});
}
`;
}

function generateClientEntry(route: ResolvedRouteConfig, registry: RegistryFile["implementations"], contracts: IslandContract[]): string {
  const boot = bootableIslands(route);
  const imports: string[] = [`import { initHarness } from "@harness/renderers";`];
  const specs: string[] = [];
  boot.forEach((island, idx) => {
    const contract = contractOf(contracts, island.contract_id);
    const modulePath = findModulePath(registry, island.contract_id, island.renderer);
    imports.push(
      island.renderer === "vanilla"
        ? `import * as Island${idx} from ${JSON.stringify(modulePath)};`
        : `import Island${idx} from ${JSON.stringify(modulePath)};`,
    );
    specs.push(
      `{ island_id: ${JSON.stringify(island.island_id)}, contract_id: ${JSON.stringify(island.contract_id)}, renderer: ${JSON.stringify(island.renderer)}, hydration: ${JSON.stringify(island.hydration)}, mode: ${JSON.stringify(route.render_mode === "client" ? "mount" : "hydrate")}, props: ${JSON.stringify(island.props)}, needs_data: ${needsData(contract)}, module: Island${idx} }`,
    );
  });

  const dataOpts =
    route.data_strategy === "client"
      ? `{ data_strategy: "client", data_inline: null, data_path: "/__data/${route.route_id}.json" }`
      : route.data_strategy === "static" || route.data_strategy === "request"
        ? `{ data_strategy: ${JSON.stringify(route.data_strategy)}, data_inline: (typeof window !== "undefined" && window.__ROUTE_DATA__) || null, data_path: null }`
        : `{ data_strategy: "none", data_inline: null, data_path: null }`;

  return `${imports.join("\n")}

initHarness([${specs.join(", ")}], ${dataOpts});
`;
}

export async function build(profile: BuildProfile, opts: { out_dir: string }): Promise<BuildManifest> {
  const contracts = loadContracts();
  const registry = loadRegistry();

  mkdirSync(opts.out_dir, { recursive: true });
  mkdirSync(join(opts.out_dir, "static"), { recursive: true });
  mkdirSync(join(opts.out_dir, "server"), { recursive: true });
  mkdirSync(join(opts.out_dir, "assets"), { recursive: true });
  mkdirSync(join(opts.out_dir, "data"), { recursive: true });

  const manifest: BuildManifest = {
    schema_version: 1,
    profile_id: profile.profile_id,
    built_at: new Date().toISOString(),
    routes: [],
  };

  for (const route of profile.routes) {
    const serverFile = `server/${route.route_id}.mjs`;
    const serverEntry = generateServerEntry(route, registry, contracts);
    await bundleToFile(serverEntry, join(opts.out_dir, serverFile), "node", "ssr");

    const boot = bootableIslands(route);
    const hasAssets = boot.length > 0 || route.render_mode === "client";
    let jsFiles: { file: string; bytes: number }[] = [];
    if (hasAssets) {
      const assetFile = `assets/${route.route_id}.js`;
      const clientEntry = generateClientEntry(route, registry, contracts);
      await bundleToFile(clientEntry, join(opts.out_dir, assetFile), "browser", "dom");
      jsFiles = [{ file: assetFile, bytes: statSync(join(opts.out_dir, assetFile)).size }];
    }

    let dataFile: string | null = null;
    if (route.data_strategy === "client" || route.data_strategy === "request") {
      if (route.data_url) {
        dataFile = `data/${route.route_id}.json`;
        copyFileSync(join(REPO_ROOT, route.data_url.replace(/^\.\//, "")), join(opts.out_dir, dataFile));
      }
    }

    let htmlFile: string | null = null;
    if (route.render_mode === "static" || route.render_mode === "client") {
      htmlFile = `static/${route.route_id}.html`;
      const serverModule = (await import(pathToFileURL(join(opts.out_dir, serverFile)).href)) as {
        default: (data: JsonValue | null) => Promise<string>;
      };
      let buildTimeData: JsonValue | null = null;
      if (route.render_mode === "static" && route.data_strategy === "static" && route.data_url) {
        buildTimeData = JSON.parse(readFileSync(join(REPO_ROOT, route.data_url.replace(/^\.\//, "")), "utf-8")) as JsonValue;
      }
      const html = await serverModule.default(buildTimeData);
      writeFileSync(join(opts.out_dir, htmlFile), html);
    }

    manifest.routes.push({
      route_id: route.route_id,
      path: route.path,
      render_mode: route.render_mode,
      html_file: htmlFile,
      server_file: serverFile,
      data_strategy: route.data_strategy,
      js_files: jsFiles,
      data_file: dataFile,
    });
  }

  writeFileSync(join(opts.out_dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  rmSync(TMP_DIR, { recursive: true, force: true });
  return manifest;
}
