import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";

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

/**
 * SqliteClient implements the shared async DbClient interface
 * (queryOne/queryAll/execute/transaction/withTransaction, all
 * Promise-returning) that Stage 12's PostgresClient will implement
 * alongside it. node:sqlite itself has no real async I/O to wait on, so
 * this is a pure interface-level change — every public method just wraps
 * the same synchronous work in a resolved Promise. Migration bootstrap
 * still runs entirely through the sync primitives below: it happens inside
 * the constructor, which can't be async, so it can never go through the
 * public async methods.
 */
export class SqliteClient {
  constructor(dbPath = process.env.VEMS_DB_PATH ?? ".data/platform.sqlite") {
    this.dbPath = resolve(dbPath);
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = DatabaseSync ? new DatabaseSync(this.dbPath, { timeout: 5000 }) : null;
    if (this.db) {
      this.db.exec("PRAGMA foreign_keys = ON;");
      this.db.exec("PRAGMA journal_mode = WAL;");
    }
    // node:sqlite exposes one synchronous connection with no real I/O to
    // await on. Before this class had an async interface, every caller ran
    // fully synchronously, so two logical operations could never interleave
    // on this connection. Now that every public method has a real await
    // point, concurrent callers (e.g. two overlapping withTransaction calls)
    // can interleave and open two BEGINs on the same connection, which
    // node:sqlite rejects. This lock serializes all public async access to
    // restore that same never-interleaves guarantee. AsyncLocalStorage lets
    // work done *inside* a held transaction's callback reenter without
    // deadlocking on its own lock.
    this._lock = Promise.resolve();
    this._txStorage = new AsyncLocalStorage();
    this.bootstrap();
  }

  async _withLock(fn) {
    if (this._txStorage.getStore()) return fn();
    let release;
    const previous = this._lock;
    this._lock = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await this._txStorage.run(true, fn);
    } finally {
      release();
    }
  }

  bootstrap() {
    this.executeSync(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );`);

    for (const migration of migrationFiles()) {
      const existing = this.queryOneSync(`SELECT id FROM schema_migrations WHERE id = ${sqlValue(migration.id)};`);
      if (existing) continue;
      const sql = readFileSync(migration.file, "utf8");
      this.transactionSync([
        sql,
        `INSERT INTO schema_migrations (id, applied_at) VALUES (${sqlValue(migration.id)}, ${sqlValue(new Date().toISOString())});`
      ]);
    }
  }

  // --- sync primitives (bootstrap only — never called from repositories/OrchestrationService) ---

  queryAllSync(sql) {
    if (this.db) return this.db.prepare(sql).all();
    const output = runSqlite(this.dbPath, ["-json"], sql);
    return output.trim() ? JSON.parse(output) : [];
  }

  queryOneSync(sql) {
    if (this.db) return this.db.prepare(sql).get();
    return this.queryAllSync(sql)[0];
  }

  executeSync(sql) {
    if (this.db) {
      this.db.exec(sql);
      return;
    }
    runSqlite(this.dbPath, [], sql);
  }

  transactionSync(statements) {
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
      this.executeSync(script);
    } catch (error) {
      try {
        this.executeSync("ROLLBACK;");
      } catch {
        // no-op
      }
      throw error;
    }
  }

  // --- async DbClient interface (everything outside bootstrap) ---

  async queryAll(sql) {
    return this._withLock(() => this.queryAllSync(sql));
  }

  async queryOne(sql) {
    return this._withLock(() => this.queryOneSync(sql));
  }

  async execute(sql) {
    return this._withLock(() => this.executeSync(sql));
  }

  async transaction(statements) {
    return this._withLock(() => this.transactionSync(statements));
  }

  async withTransaction(callback) {
    return this._withLock(async () => {
      if (this.db) {
        this.db.exec("BEGIN IMMEDIATE;");
        try {
          const result = await callback();
          this.db.exec("COMMIT;");
          return result;
        } catch (error) {
          this.db.exec("ROLLBACK;");
          throw error;
        }
      }
      this.executeSync("BEGIN IMMEDIATE;");
      try {
        const result = await callback();
        this.executeSync("COMMIT;");
        return result;
      } catch (error) {
        try {
          this.executeSync("ROLLBACK;");
        } catch {
          // no-op
        }
        throw error;
      }
    });
  }
}

export function hasEmbeddedSqliteRuntime() {
  return Boolean(DatabaseSync);
}

export { sqlValue };
