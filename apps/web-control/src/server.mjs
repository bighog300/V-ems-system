import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const root = new URL(".", import.meta.url).pathname;

const contentTypeByExt = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const resolved = join(root, path);
    const file = await readFile(resolved);
    const ext = extname(resolved);
    res.writeHead(200, { "content-type": contentTypeByExt[ext] ?? "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

const port = Number(process.env.PORT ?? 4173);
server.listen(port, () => {
  console.log(`web-control listening on ${port}`);
});
