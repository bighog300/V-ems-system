import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const EXTENSIONS = new Set([".mjs", ".js", ".sh"]);
const SKIP_DIRS = new Set(["node_modules", ".git"]);

function collectFiles(dir, results) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectFiles(fullPath, results);
    } else if (EXTENSIONS.has(path.extname(entry))) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = collectFiles(".", []);

const failures = [];
for (const file of files) {
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (/\s+$/.test(line)) failures.push(`${file}:${index + 1} trailing whitespace`);
    if (line.includes("\t")) failures.push(`${file}:${index + 1} tab character`);
  });
}

if (failures.length > 0) {
  console.error("Lint failures:\n" + failures.join("\n"));
  process.exit(1);
}

console.log(`lint ok (${files.length} files)`);
