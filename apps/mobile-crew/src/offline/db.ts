const DATABASE_NAME = "vems-mobile-crew-offline.db";

/**
 * The subset of expo-sqlite's SQLiteDatabase API this module relies on.
 * Defining it as an interface (rather than importing expo-sqlite's own
 * type) keeps every function below testable with a plain-Node adapter —
 * see test/offline/db.test.ts, which wraps node:sqlite's DatabaseSync to
 * satisfy this same shape against a real SQLite engine.
 */
export interface OfflineSqliteLike {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;
}

// expo-sqlite is a native module that only resolves inside the Expo/RN
// runtime — lazily imported here for the same reason session.ts and
// appLock.ts do.
let defaultDatabasePromise: Promise<OfflineSqliteLike> | null = null;
async function openDefaultDatabase(): Promise<OfflineSqliteLike> {
  const { openDatabaseAsync } = await import("expo-sqlite");
  return openDatabaseAsync(DATABASE_NAME) as unknown as OfflineSqliteLike;
}

export async function getOfflineDatabase(): Promise<OfflineSqliteLike> {
  if (!defaultDatabasePromise) defaultDatabasePromise = openDefaultDatabase().then(async (db) => { await migrate(db); return db; });
  return defaultDatabasePromise;
}

export async function migrate(db: OfflineSqliteLike): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS outbox_entries (
      entry_id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      patient_case_id TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      encrypted_payload TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_attempted_at TEXT,
      last_error TEXT,
      server_resource_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS outbox_entries_patient_case_id ON outbox_entries (patient_case_id);
    CREATE INDEX IF NOT EXISTS outbox_entries_status ON outbox_entries (status);

    CREATE TABLE IF NOT EXISTS cached_reads (
      cache_key TEXT PRIMARY KEY,
      encrypted_payload TEXT NOT NULL,
      cached_at TEXT NOT NULL
    );
  `);
}

export type OutboxStatus = "queued" | "sending" | "acknowledged" | "retrying" | "conflict" | "failed";

export interface OutboxEntryRow {
  entry_id: string;
  scope: string;
  patient_case_id: string;
  method: string;
  path: string;
  encrypted_payload: string;
  status: OutboxStatus;
  attempt_count: number;
  last_attempted_at: string | null;
  last_error: string | null;
  server_resource_id: string | null;
  created_at: string;
}

export interface NewOutboxEntryRow {
  entryId: string;
  scope: string;
  patientCaseId: string;
  method: string;
  path: string;
  encryptedPayload: string;
  createdAt: string;
}

export async function insertOutboxEntry(db: OfflineSqliteLike, entry: NewOutboxEntryRow): Promise<void> {
  await db.runAsync(
    `INSERT INTO outbox_entries (entry_id, scope, patient_case_id, method, path, encrypted_payload, status, attempt_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?);`,
    [entry.entryId, entry.scope, entry.patientCaseId, entry.method, entry.path, entry.encryptedPayload, entry.createdAt]
  );
}

export async function getOutboxEntry(db: OfflineSqliteLike, entryId: string): Promise<OutboxEntryRow | null> {
  return db.getFirstAsync<OutboxEntryRow>(`SELECT * FROM outbox_entries WHERE entry_id = ?;`, [entryId]);
}

export interface ListOutboxEntriesFilter {
  status?: OutboxStatus[];
  patientCaseId?: string;
}

export async function listOutboxEntries(db: OfflineSqliteLike, filter: ListOutboxEntriesFilter = {}): Promise<OutboxEntryRow[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.status?.length) {
    clauses.push(`status IN (${filter.status.map(() => "?").join(",")})`);
    params.push(...filter.status);
  }
  if (filter.patientCaseId) {
    clauses.push(`patient_case_id = ?`);
    params.push(filter.patientCaseId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  // entry_id is a random UUID, not a monotonic sequence, so it can't be a
  // reliable tiebreaker for entries created in the same millisecond — the
  // implicit SQLite rowid (insertion-ordered) is. Same fix as the backend's
  // EventOutboxRepository.listAll() for the same underlying reason.
  return db.getAllAsync<OutboxEntryRow>(`SELECT * FROM outbox_entries ${where} ORDER BY created_at, rowid;`, params);
}

export interface OutboxEntryPatch {
  status?: OutboxStatus;
  attemptCount?: number;
  lastAttemptedAt?: string | null;
  lastError?: string | null;
  serverResourceId?: string | null;
}

export async function updateOutboxEntry(db: OfflineSqliteLike, entryId: string, patch: OutboxEntryPatch): Promise<void> {
  const columns: Record<string, unknown> = {};
  if (patch.status !== undefined) columns.status = patch.status;
  if (patch.attemptCount !== undefined) columns.attempt_count = patch.attemptCount;
  if (patch.lastAttemptedAt !== undefined) columns.last_attempted_at = patch.lastAttemptedAt;
  if (patch.lastError !== undefined) columns.last_error = patch.lastError;
  if (patch.serverResourceId !== undefined) columns.server_resource_id = patch.serverResourceId;
  const keys = Object.keys(columns);
  if (keys.length === 0) return;
  await db.runAsync(
    `UPDATE outbox_entries SET ${keys.map((key) => `${key} = ?`).join(", ")} WHERE entry_id = ?;`,
    [...keys.map((key) => columns[key]), entryId]
  );
}

export interface CachedReadRow {
  cache_key: string;
  encrypted_payload: string;
  cached_at: string;
}

export async function setCachedReadRow(db: OfflineSqliteLike, cacheKey: string, encryptedPayload: string, cachedAt: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO cached_reads (cache_key, encrypted_payload, cached_at) VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET encrypted_payload = excluded.encrypted_payload, cached_at = excluded.cached_at;`,
    [cacheKey, encryptedPayload, cachedAt]
  );
}

export async function getCachedReadRow(db: OfflineSqliteLike, cacheKey: string): Promise<CachedReadRow | null> {
  return db.getFirstAsync<CachedReadRow>(`SELECT * FROM cached_reads WHERE cache_key = ?;`, [cacheKey]);
}
