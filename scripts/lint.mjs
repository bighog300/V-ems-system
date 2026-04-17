import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const files = execSync("rg --files -g '*.mjs' -g '*.js' -g '*.sh'", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

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
