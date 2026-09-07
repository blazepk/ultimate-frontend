// Local static/server route server, per docs/CONTRACTS.md §11.3. Driven
// entirely by manifest.json; no SiteConfig access needed.

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import type { JsonValue } from "@harness/contracts";

const DATA_PATH_PREFIX = "/__data/"; // CONTRACTS.md §1.4

interface ManifestRoute {
  route_id: string;
  path: string;
  render_mode: "static" | "server" | "client";
  html_file: string | null;
  server_file: string;
  data_strategy: "none" | "static" | "request" | "client";
  js_files: { file: string; bytes: number }[];
  data_file: string | null;
}
interface Manifest {
  schema_version: 1;
  profile_id: string;
  built_at: string;
  routes: ManifestRoute[];
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
};

export async function serve(dist_dir: string, opts: { port: number }): Promise<{ base_url: string; close(): Promise<void> }> {
  const manifest = JSON.parse(readFileSync(join(dist_dir, "manifest.json"), "utf-8")) as Manifest;
  const routesByPath = new Map(manifest.routes.map((r) => [r.path, r]));
  const routesById = new Map(manifest.routes.map((r) => [r.route_id, r]));

  const server = createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const pathname = decodeURIComponent(url.pathname);

        if (pathname.startsWith(DATA_PATH_PREFIX)) {
          const routeId = pathname.slice(DATA_PATH_PREFIX.length).replace(/\.json$/, "");
          const route = routesById.get(routeId);
          if (route?.data_file) {
            res.writeHead(200, { "content-type": CONTENT_TYPES[".json"] });
            res.end(readFileSync(join(dist_dir, route.data_file)));
            return;
          }
          res.writeHead(404).end();
          return;
        }

        if (pathname.startsWith("/assets/")) {
          const filePath = join(dist_dir, pathname.slice(1));
          if (existsSync(filePath)) {
            res.writeHead(200, { "content-type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream" });
            res.end(readFileSync(filePath));
            return;
          }
          res.writeHead(404).end();
          return;
        }

        const route = routesByPath.get(pathname);
        if (!route) {
          res.writeHead(404).end();
          return;
        }

        if (route.render_mode === "server") {
          let data: JsonValue | null = null;
          if (route.data_strategy === "request" && route.data_file) {
            data = JSON.parse(readFileSync(join(dist_dir, route.data_file), "utf-8")) as JsonValue;
          }
          const mod = (await import(pathToFileURL(join(dist_dir, route.server_file)).href)) as {
            default: (d: JsonValue | null) => Promise<string>;
          };
          const html = await mod.default(data);
          res.writeHead(200, { "content-type": CONTENT_TYPES[".html"] });
          res.end(html);
          return;
        }

        if (route.html_file) {
          res.writeHead(200, { "content-type": CONTENT_TYPES[".html"] });
          res.end(readFileSync(join(dist_dir, route.html_file)));
          return;
        }

        res.writeHead(404).end();
      } catch (err) {
        res.writeHead(500).end(String(err));
      }
    })();
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(opts.port, () => resolvePromise());
  });

  const base_url = `http://localhost:${opts.port}`;
  return {
    base_url,
    close: () =>
      new Promise<void>((resolvePromise, reject) => {
        server.close((err) => (err ? reject(err) : resolvePromise()));
      }),
  };
}
