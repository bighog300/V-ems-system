import { SqliteClient } from "./db.mjs";
import { SyncIntentRepository } from "./repositories/sync-intent-repository.mjs";
import { SyncWorker } from "./sync-worker.mjs";
import { createOpenEmrTransportFromEnv, createVtigerTransportFromEnv } from "./adapters/transports.mjs";

function parsePositiveInt(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function loadSyncWorkerConfig(env = process.env) {
  return {
    dbPath: env.VEMS_DB_PATH ?? ".data/platform.sqlite",
    pollIntervalMs: parsePositiveInt(env.SYNC_WORKER_POLL_INTERVAL_MS, 2000),
    batchSize: parsePositiveInt(env.SYNC_WORKER_BATCH_SIZE, 100),
    maxAttempts: parsePositiveInt(env.SYNC_WORKER_MAX_ATTEMPTS, 3),
    baseBackoffMs: parsePositiveInt(env.SYNC_WORKER_BACKOFF_BASE_MS, 0),
    maxBackoffMs: parsePositiveInt(env.SYNC_WORKER_BACKOFF_MAX_MS, 60000)
  };
}

async function unsupportedTransport({ target, method }) {
  throw new Error(`Sync worker transport for ${target}.${method} is not configured`);
}

function createAdapterProxy(target, methods, transport = unsupportedTransport) {
  const adapter = {};
  for (const method of methods) {
    adapter[method] = async (payload) => transport({ target, method, payload });
  }
  return adapter;
}

function logCycle(cycleNumber, config, cycle) {
  console.info(
    `[sync-worker] cycle=${cycleNumber} started_at=${cycle.startedAt} finished_at=${cycle.finishedAt} poll_ms=${config.pollIntervalMs} batch_size=${config.batchSize} fetched=${cycle.fetchedCount} statuses=${JSON.stringify(cycle.statusCounts)}`
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSyncWorkerService(options = {}) {
  const config = options.config ?? loadSyncWorkerConfig();
  const db = options.db ?? new SqliteClient(config.dbPath);
  const syncIntents = options.syncIntents ?? new SyncIntentRepository(db);
  const transport = options.transport ?? unsupportedTransport;
  const openemrTransport = options.openemrTransport ?? createOpenEmrTransportFromEnv() ?? transport;
  const vtigerTransport = options.vtigerTransport ?? createVtigerTransportFromEnv() ?? transport;

  const worker = options.worker ?? new SyncWorker({
    syncIntents,
    maxAttempts: config.maxAttempts,
    baseBackoffMs: config.baseBackoffMs,
    maxBackoffMs: config.maxBackoffMs,
    vtiger: options.vtiger ?? createAdapterProxy("vtiger", [
      "createIncidentMirror",
      "updateIncidentMirror",
      "createAssignmentMirror",
      "updateAssignmentMirror"
    ], vtigerTransport),
    openemr: options.openemr ?? createAdapterProxy("openemr", [
      "createPatient",
      "createEncounter",
      "createObservation",
      "createIntervention",
      "createHandover"
    ], openemrTransport)
  });

  let stopping = false;
  const stop = () => {
    if (!stopping) {
      stopping = true;
      console.info("[sync-worker] shutdown requested; exiting after current cycle");
    }
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.info(
    `[sync-worker] starting service db_path=${config.dbPath} poll_ms=${config.pollIntervalMs} batch_size=${config.batchSize} max_attempts=${config.maxAttempts}`
  );

  let cycleNumber = 0;
  while (!stopping) {
    cycleNumber += 1;
    const cycle = await worker.processCycle(config.batchSize);
    logCycle(cycleNumber, config, cycle);

    if (!stopping) await sleep(config.pollIntervalMs);
  }

  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  console.info("[sync-worker] service stopped");
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  runSyncWorkerService().catch((error) => {
    console.error("[sync-worker] fatal error", error);
    process.exitCode = 1;
  });
}
