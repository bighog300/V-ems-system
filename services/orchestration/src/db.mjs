import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

export class SqliteClient {
  constructor(dbPath = process.env.VEMS_DB_PATH ?? ".data/platform.sqlite") {
    this.dbPath = resolve(dbPath);
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.bootstrap();
  }

  bootstrap() {
    const schemaPath = new URL("./schema.sql", import.meta.url);
    const sql = readFileSync(schemaPath, "utf8");
    this.execute(sql);
  }

  queryAll(sql) {
    const output = execFileSync("sqlite3", ["-json", this.dbPath, sql], { encoding: "utf8" });
    return output.trim() ? JSON.parse(output) : [];
  }

  queryOne(sql) {
    return this.queryAll(sql)[0];
  }

  execute(sql) {
    execFileSync("sqlite3", [this.dbPath], { input: sql, encoding: "utf8" });
  }

  transaction(statements) {
    const script = ["BEGIN IMMEDIATE;", ...statements, "COMMIT;"].join("\n");
    try {
      this.execute(script);
    } catch (error) {
      try {
        this.execute("ROLLBACK;");
      } catch {}
      throw error;
    }
  }
}

export { sqlValue };
