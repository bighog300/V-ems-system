import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, isAbsolute, relative, resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));

const contentTypeByExt = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

function resolveStaticPath(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const requestPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const resolved = resolve(root, `.${requestPath}`);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return resolved;
}

export function createApp() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const resolved = resolveStaticPath(url.pathname);
      if (!resolved) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      const file = await readFile(resolved);
      const ext = extname(resolved);
      res.writeHead(200, { "content-type": contentTypeByExt[ext] ?? "application/octet-stream" });
      res.end(file);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createApp();
  const port = Number(process.env.PORT ?? 4173);
  server.listen(port, () => {
    console.log(`web-control listening on ${port}`);
  });
}
