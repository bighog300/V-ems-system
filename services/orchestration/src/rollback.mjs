import { existsSync, readFileSync } from "node:fs";
import { sqlValue } from "./sql-value.mjs";

/**
 * Migrations in this codebase are additive (CREATE TABLE IF NOT EXISTS,
 * ALTER TABLE ADD COLUMN) with no down-migration convention prior to
 * Stage 12 — there was nothing to roll back before a second backend made
 * "deploy a bad migration to Postgres" a real operational scenario. Rather
 * than retrofit down-migrations for the entire pre-12b history, this adds
 * the convention going forward: an optional `<id>.rollback.sql` (or a
 * dialect-specific `<id>.rollback.<dialect>.sql`) sibling next to a
 * migration undoes it. A migration with no rollback file simply can't be
 * rolled back through this tool — that's surfaced as an error, never a
 * silent no-op.
 */
function rollbackFileFor(id, dialect) {
  const dialectSpecific = new URL(`./migrations/${id}.rollback.${dialect}.sql`, import.meta.url);
  if (existsSync(dialectSpecific)) return dialectSpecific;
  const shared = new URL(`./migrations/${id}.rollback.sql`, import.meta.url);
  if (existsSync(shared)) return shared;
  return null;
}

export async function lastAppliedMigration(db) {
  const rows = await db.queryAll("SELECT id FROM schema_migrations ORDER BY applied_at DESC, id DESC LIMIT 1;");
  return rows[0]?.id ?? null;
}

export async function rollbackLastMigration(db) {
  const id = await lastAppliedMigration(db);
  if (!id) throw new Error("No migrations have been applied; nothing to roll back.");
  const file = rollbackFileFor(id, db.dialect);
  if (!file) {
    throw new Error(
      `No rollback script exists for migration "${id}" (expected migrations/${id}.rollback.sql ` +
      `or migrations/${id}.rollback.${db.dialect}.sql).`
    );
  }
  const sql = readFileSync(file, "utf8");
  await db.withTransaction(async () => {
    await db.execute(sql);
    await db.execute(`DELETE FROM schema_migrations WHERE id = ${sqlValue(id)};`);
  });
  return id;
}
