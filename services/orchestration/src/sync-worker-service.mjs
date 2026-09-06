import { SqliteClient } from "./db.mjs";
import { SyncIntentRepository } from "./repositories/sync-intent-repository.mjs";
import { SyncWorker } from "./sync-worker.mjs";
import { createOpenEmrTransportFromEnv, createVtigerTransportFromEnv } from "./adapters/transports.mjs";
import { VtigerAdapterClient } from "./adapters/vtiger/vtiger-adapter-client.mjs";
import { VtigerLinkRepository } from "./repositories/vtiger-link-repository.mjs";
import { AssignmentVtigerLinkRepository } from "./repositories/assignment-vtiger-link-repository.mjs";

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
    baseBackoffMs: parsePositiveInt(env.SYNC_WORKER_BACKOFF_BASE_MS, 1000),
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
  const vtigerLinks = options.vtigerLinks ?? new VtigerLinkRepository(db);
  const assignmentLinks = options.assignmentLinks ?? new AssignmentVtigerLinkRepository(db);
  const transport = options.transport ?? unsupportedTransport;
  const openemrTransport = options.openemrTransport ?? createOpenEmrTransportFromEnv() ?? transport;
  const vtigerTransport = options.vtigerTransport ?? createVtigerTransportFromEnv() ?? transport;

  const vtiger = options.vtiger ?? new VtigerAdapterClient({ transport: vtigerTransport });
  const workerVtiger = {
    createIncidentMirror: (...args) => vtiger.createIncidentMirror(...args),
    updateIncidentMirror: (...args) => vtiger.updateIncidentMirror(...args),
    recordStockUsageMirror: (...args) => vtiger.recordStockUsageMirror(...args),
    async createAssignmentMirror(payload) {
      const incident = vtigerLinks.findByIncidentId(payload.incident_id);
      if (!incident?.remote_id || incident.sync_status !== "succeeded") {
        const error = new Error("Incident Vtiger linkage is pending");
        error.code = "VTIGER_DEPENDENCY_PENDING";
        error.classification = error.code;
        error.retryable = true;
        throw error;
      }
      return vtiger.createAssignmentMirror({ ...payload, incident_remote_id: incident.remote_id, vems_incident_remote_id: incident.remote_id, incident_ref: incident.remote_id });
    },
    async updateAssignmentMirror(payload) {
      const link = assignmentLinks.findByAssignmentId(payload.assignment_id);
      if (!link?.remote_id) {
        const error = new Error("Assignment Vtiger linkage is not established");
        error.code = "VTIGER_REMOTE_NOT_FOUND";
        error.classification = error.code;
        throw error;
      }
      return vtiger.updateAssignmentMirror({ ...payload, remote_id: link.remote_id, incident_remote_id: link.incident_remote_id, vems_incident_remote_id: link.incident_remote_id });
    }
  };
  const worker = options.worker ?? new SyncWorker({
    syncIntents,
    maxAttempts: config.maxAttempts,
    baseBackoffMs: config.baseBackoffMs,
    maxBackoffMs: config.maxBackoffMs,
    vtiger: workerVtiger,
    openemr: options.openemr ?? createAdapterProxy("openemr", [
      "createPatient",
      "createEncounter",
      "createObservation",
      "createIntervention",
      "createHandover"
    ], openemrTransport),
    onSuccess: async (intent, result) => {
      if (intent.target_system !== "vtiger" || !result?.remote_id) return false;
      const now = new Date().toISOString();
      if (intent.entity_type === "assignment") {
        const current = assignmentLinks.findByAssignmentId(intent.payload.assignment_id);
        db.withTransaction(() => {
          assignmentLinks.upsert({ assignment_id: intent.payload.assignment_id, incident_id: intent.payload.incident_id, remote_id: result.remote_id, remote_number: result.remote_number ?? null, external_key: result.external_key ?? current?.external_key ?? `${process.env.VTIGER_SOURCE_NAMESPACE ?? "vems"}:assignment:${intent.payload.assignment_id}`, incident_remote_id: result.incident_remote_id ?? intent.payload.vems_incident_remote_id ?? current?.incident_remote_id, create_correlation_id: current?.create_correlation_id ?? intent.correlation_id, last_correlation_id: intent.correlation_id, sync_status: "succeeded", last_error_code: null, last_synced_at: now, created_at: current?.created_at ?? now, updated_at: now });
          syncIntents.markSucceeded(intent.intent_id, now);
        });
        return true;
      }
      if (intent.entity_type !== "incident") return false;
      const link = vtigerLinks.findByIncidentId(intent.payload.incident_id);
      db.withTransaction(() => {
        vtigerLinks.upsert({
          incident_id: intent.payload.incident_id,
          remote_id: result.remote_id,
          remote_number: result.remote_number ?? null,
          external_key: result.external_key ?? link?.external_key ?? `${process.env.VTIGER_SOURCE_NAMESPACE ?? "vems"}:${intent.payload.incident_id}`,
          create_correlation_id: link?.create_correlation_id ?? intent.correlation_id,
          last_correlation_id: intent.correlation_id,
          sync_status: "succeeded",
          last_error_code: null,
          last_synced_at: now,
          created_at: link?.created_at ?? now,
          updated_at: now
        });
        syncIntents.markSucceeded(intent.intent_id, now);
      });
      return true;
    },
    onFailure: (intent, error, state) => {
      if (intent.target_system !== "vtiger") return;
      if (intent.entity_type === "assignment") {
        assignmentLinks.markFailure(intent.payload.assignment_id, error?.code ?? error?.classification ?? "DOWNSTREAM_UNAVAILABLE", state.status, new Date().toISOString());
        return;
      }
      if (intent.entity_type !== "incident") return;
      const existing = vtigerLinks.findByIncidentId(intent.payload.incident_id);
      if (!existing) return;
      vtigerLinks.markFailure(
        intent.payload.incident_id,
        error?.code ?? error?.classification ?? "DOWNSTREAM_UNAVAILABLE",
        state.status,
        new Date().toISOString()
      );
    }
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
