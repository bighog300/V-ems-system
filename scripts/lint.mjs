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

// Stage 12 milestone 12e: a static, no-behavior-change guard against a
// future logger call site accidentally logging PHI. Every logger.*() call
// in the codebase today passes only a hand-picked set of safe fields
// (identifiers, status codes, durations, enum-like values) -- never a
// demographic/clinical payload wholesale, and never a known PHI-bearing
// field name. This can't catch every possible leak (it's a source-text
// scan, not a runtime data check), but it catches the most common
// regression: someone spreading a request payload, a database record, or
// a named PHI field straight into a log call.
const LOGGER_CALL_PATTERN = /\blogger\.(?:debug|info|warn|error)\(/g;
const PHI_DENYLIST = [
  "payload", "req.body", "reqBody", "requestBody", "record", "demographics",
  "dob", "date_of_birth", "first_name", "last_name", "middle_name", "preferred_name",
  "phone", "email", "address_line", "next_of_kin", "guardian_name", "guardian_phone",
  "ssn", "medication_name", "vital_signs", "observations", "presenting_complaint",
  "content_base64", "assessment", "identity_document"
];
const PHI_DENYLIST_PATTERN = new RegExp(`\\b(?:${PHI_DENYLIST.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");

function findLoggerCalls(content) {
  const calls = [];
  let match;
  while ((match = LOGGER_CALL_PATTERN.exec(content))) {
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < content.length && depth > 0; i++) {
      if (content[i] === "(") depth++;
      else if (content[i] === ")") depth--;
    }
    calls.push({ start: match.index, text: content.slice(match.index, i) });
  }
  return calls;
}

function scanPhiSafeLogging(file, content, failures) {
  if (file.endsWith(".test.mjs") || file.includes("/test/")) return;
  for (const call of findLoggerCalls(content)) {
    const found = call.text.match(PHI_DENYLIST_PATTERN);
    if (!found) continue;
    const line = content.slice(0, call.start).split("\n").length;
    failures.push(`${file}:${line} logger call references "${found[0]}" -- pass only specific, reviewed-safe fields, never a payload/record wholesale or a named PHI field`);
  }
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
  if (file.endsWith(".mjs") || file.endsWith(".js")) scanPhiSafeLogging(file, content, failures);
}

if (failures.length > 0) {
  console.error("Lint failures:\n" + failures.join("\n"));
  process.exit(1);
}

console.log(`lint ok (${files.length} files)`);
