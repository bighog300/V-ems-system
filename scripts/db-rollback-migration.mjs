#!/usr/bin/env node
// Rolls back the most recently applied orchestration DB migration.
//
// Usage:
//   node scripts/db-rollback-migration.mjs                # sqlite, VEMS_DB_PATH
//   VEMS_DB_DRIVER=postgres VEMS_POSTGRES_URL=... node scripts/db-rollback-migration.mjs
//
// Only migrations with a `<id>.rollback.sql` (or dialect-specific
// `<id>.rollback.<dialect>.sql`) sibling in services/orchestration/src/migrations
// can be rolled back — see src/rollback.mjs for why.
import { createDbClient } from "../services/orchestration/src/db.mjs";
import { rollbackLastMigration } from "../services/orchestration/src/rollback.mjs";

async function main() {
  const db = createDbClient({
    driver: process.env.VEMS_DB_DRIVER,
    dbPath: process.env.VEMS_DB_PATH,
    connectionString: process.env.VEMS_POSTGRES_URL ?? process.env.DATABASE_URL
  });
  try {
    await db.execute("SELECT 1;"); // wait for bootstrap to finish
    const id = await rollbackLastMigration(db);
    console.log(`Rolled back migration: ${id}`);
  } finally {
    if (typeof db.close === "function") await db.close();
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
