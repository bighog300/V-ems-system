import { readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Resolves the ordered list of migrations for a given DbClient dialect.
 * A migration's id (its schema_migrations bookkeeping key) is always the
 * base filename (e.g. "001_initial_schema"), regardless of dialect, so a
 * SQLite and a Postgres deployment apply the same logical migration set in
 * the same order — only the SQL text differs where a migration is
 * dialect-specific. A migration gets a dialect-specific variant
 * (`<id>.<dialect>.sql`, e.g. "001_initial_schema.postgres.sql") only where
 * its SQL actually diverges (AUTOINCREMENT vs SERIAL, printf, etc.); every
 * other migration is shared as-is via its base `<id>.sql` file.
 */
export function migrationFiles(dialect = "sqlite") {
  const dir = new URL("./migrations/", import.meta.url);
  const dirPath = resolve(dir.pathname);
  const entries = readdirSync(dirPath);
  const baseNames = entries
    .filter((name) => /^\d+_[^.]+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b));

  return baseNames.map((name) => {
    const id = name.replace(/\.sql$/, "");
    const dialectName = `${id}.${dialect}.sql`;
    const file = entries.includes(dialectName)
      ? new URL(`./migrations/${dialectName}`, import.meta.url)
      : new URL(`./migrations/${name}`, import.meta.url);
    return { id, file };
  });
}
