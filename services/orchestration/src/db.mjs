import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const PYTHON_SQLITE_CLIENT = `
import json, sqlite3, sys

db_path = sys.argv[1]
mode = sys.argv[2]
sql = sys.argv[3]

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
conn.execute("PRAGMA foreign_keys = ON;")

if mode == "query":
  cur = conn.execute(sql)
  rows = [dict(row) for row in cur.fetchall()]
  conn.commit()
  print(json.dumps(rows))
elif mode == "exec":
  conn.executescript(sql)
  conn.commit()
  print("ok")
else:
  raise SystemExit("unknown mode")
`;

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
    const output = execFileSync("python3", ["-c", PYTHON_SQLITE_CLIENT, this.dbPath, "query", sql], { encoding: "utf8" });
    return output.trim() ? JSON.parse(output) : [];
  }

  queryOne(sql) {
    return this.queryAll(sql)[0];
  }

  execute(sql) {
    execFileSync("python3", ["-c", PYTHON_SQLITE_CLIENT, this.dbPath, "exec", sql], { encoding: "utf8" });
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
