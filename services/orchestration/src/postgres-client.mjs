import { readFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import { migrationFiles } from "./migration-files.mjs";
import { sqlValue } from "./sql-value.mjs";

const { Pool } = pg;

/**
 * PostgresClient implements the same async DbClient interface as
 * SqliteClient (queryOne/queryAll/execute/transaction/withTransaction),
 * against a real `pg` connection pool. Unlike SqliteClient, migration
 * bootstrap here is inherently async (network I/O), so it can't run inside
 * the constructor; instead the constructor kicks it off and stores a
 * readiness promise that every public method awaits first. Callers can
 * `new PostgresClient(...)` and immediately start calling its async
 * methods exactly like SqliteClient — they just transparently wait for
 * migrations to finish underneath.
 *
 * A pool hands out a different physical connection per query by default,
 * so a `withTransaction` callback's own `BEGIN`/`COMMIT` needs every query
 * made inside it (including ones made by repository calls several layers
 * down) pinned to the one connection that opened the transaction.
 * AsyncLocalStorage carries that dedicated client through the async call
 * graph — the same reentrancy mechanism SqliteClient uses for its lock,
 * here used to route queries to the right connection instead.
 */
export class PostgresClient {
  dialect = "postgres";

  constructor(options = {}) {
    const connectionString = options.connectionString ?? process.env.VEMS_POSTGRES_URL ?? process.env.DATABASE_URL;
    this.pool = options.pool ?? new Pool({
      connectionString,
      max: options.poolSize ?? 10
    });
    this._txStorage = new AsyncLocalStorage();
    this._ready = this._bootstrap();
  }

  async _bootstrap() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );`);

    for (const migration of migrationFiles(this.dialect)) {
      const existing = await this.pool.query(`SELECT id FROM schema_migrations WHERE id = ${sqlValue(migration.id)};`);
      if (existing.rows[0]) continue;
      const sql = readFileSync(migration.file, "utf8");
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN;");
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations (id, applied_at) VALUES (${sqlValue(migration.id)}, ${sqlValue(new Date().toISOString())});`);
        await client.query("COMMIT;");
      } catch (error) {
        await client.query("ROLLBACK;");
        throw error;
      } finally {
        client.release();
      }
    }
  }

  _connection() {
    return this._txStorage.getStore() ?? this.pool;
  }

  async queryAll(sql) {
    await this._ready;
    const result = await this._connection().query(sql);
    return result.rows;
  }

  async queryOne(sql) {
    const rows = await this.queryAll(sql);
    return rows[0];
  }

  async execute(sql) {
    await this._ready;
    await this._connection().query(sql);
  }

  async transaction(statements) {
    return this.withTransaction(async () => {
      for (const statement of statements) await this.execute(statement);
    });
  }

  async withTransaction(callback) {
    await this._ready;
    // Already inside a transaction on this connection (reentrant call from
    // within another withTransaction's own callback) — run inline on the
    // same connection rather than opening a nested BEGIN.
    const existing = this._txStorage.getStore();
    if (existing) return callback();

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");
      const result = await this._txStorage.run(client, callback);
      await client.query("COMMIT;");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK;");
      } catch {
        // no-op
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}
