import { DatabaseSync } from "node:sqlite";

import type { OfflineSqliteLike } from "../../src/offline/db.ts";

/**
 * Wraps node:sqlite's synchronous DatabaseSync to satisfy the same
 * expo-sqlite-shaped async interface production code depends on — this
 * runs every offline-storage test against a real SQLite engine instead of
 * a hand-rolled mock, in plain Node with no Expo/RN runtime.
 */
export function createNodeSqliteAdapter(): OfflineSqliteLike {
  const db = new DatabaseSync(":memory:");
  return {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, params = []) {
      const result = db.prepare(sql).run(...(params as never[]));
      return { changes: Number(result.changes) };
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []) {
      const row = db.prepare(sql).get(...(params as never[]));
      return (row ?? null) as T | null;
    }
  };
}
