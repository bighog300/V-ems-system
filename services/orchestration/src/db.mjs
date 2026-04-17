import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
    const output = runSqlite(this.dbPath, ["-json"], sql);
    return output.trim() ? JSON.parse(output) : [];
  }

  queryOne(sql) {
    return this.queryAll(sql)[0];
  }

  execute(sql) {
    runSqlite(this.dbPath, [], sql);
  }

  transaction(statements) {
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

export { sqlValue };
