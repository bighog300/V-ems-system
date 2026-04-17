import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  DatabaseSync = null;
}

function runSqlite(dbPath, args, input = undefined) {
  const baseArgs = [dbPath, ...args];
  return execFileSync("sqlite3", baseArgs, {
    encoding: "utf8",
    input
  });
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function migrationFiles() {
  const dir = new URL("./migrations/", import.meta.url);
  const filePath = resolve(dir.pathname);
  return readdirSync(filePath)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      id: name.replace(/\.sql$/, ""),
      file: new URL(`./migrations/${name}`, import.meta.url)
    }));
}

export class SqliteClient {
  constructor(dbPath = process.env.VEMS_DB_PATH ?? ".data/platform.sqlite") {
    this.dbPath = resolve(dbPath);
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = DatabaseSync ? new DatabaseSync(this.dbPath, { timeout: 5000 }) : null;
    if (this.db) {
      this.db.exec("PRAGMA foreign_keys = ON;");
      this.db.exec("PRAGMA journal_mode = WAL;");
    }
    this.bootstrap();
  }

  bootstrap() {
    this.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );`);

    for (const migration of migrationFiles()) {
      const existing = this.queryOne(`SELECT id FROM schema_migrations WHERE id = ${sqlValue(migration.id)};`);
      if (existing) continue;
      const sql = readFileSync(migration.file, "utf8");
      this.transaction([
        sql,
        `INSERT INTO schema_migrations (id, applied_at) VALUES (${sqlValue(migration.id)}, ${sqlValue(new Date().toISOString())});`
      ]);
    }
  }

  queryAll(sql) {
    if (this.db) return this.db.prepare(sql).all();
    const output = runSqlite(this.dbPath, ["-json"], sql);
    return output.trim() ? JSON.parse(output) : [];
  }

  queryOne(sql) {
    if (this.db) return this.db.prepare(sql).get();
    return this.queryAll(sql)[0];
  }

  execute(sql) {
    if (this.db) {
      this.db.exec(sql);
      return;
    }
    runSqlite(this.dbPath, [], sql);
  }

  transaction(statements) {
    if (this.db) {
      this.db.exec("BEGIN IMMEDIATE;");
      try {
        for (const statement of statements) this.db.exec(statement);
        this.db.exec("COMMIT;");
      } catch (error) {
        this.db.exec("ROLLBACK;");
        throw error;
      }
      return;
    }

    const script = ["BEGIN IMMEDIATE;", ...statements, "COMMIT;"].join("\n");
    try {
      this.execute(script);
    } catch (error) {
      try {
        this.execute("ROLLBACK;");
      } catch {
        // no-op
      }
      throw error;
    }
  }
}

export function hasEmbeddedSqliteRuntime() {
  return Boolean(DatabaseSync);
}

export { sqlValue };
