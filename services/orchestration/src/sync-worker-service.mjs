import { SqliteClient } from "./db.mjs";
import { SyncIntentRepository } from "./repositories/sync-intent-repository.mjs";
import { SyncWorker } from "./sync-worker.mjs";
import { createOpenEmrTransportFromEnv, createVtigerTransportFromEnv } from "./adapters/transports.mjs";
import { VtigerAdapterClient } from "./adapters/vtiger/vtiger-adapter-client.mjs";
import { VtigerLinkRepository } from "./repositories/vtiger-link-repository.mjs";
import { AssignmentVtigerLinkRepository } from "./repositories/assignment-vtiger-link-repository.mjs";
import { VehicleVtigerLinkRepository } from "./repositories/vehicle-vtiger-link-repository.mjs";
import { PersonnelVtigerLinkRepository } from "./repositories/personnel-vtiger-link-repository.mjs";
import { AssignmentPersonnelVtigerLinkRepository } from "./repositories/assignment-personnel-vtiger-link-repository.mjs";
import { StockItemVtigerLinkRepository } from "./repositories/stock-item-vtiger-link-repository.mjs";
import { VehicleStockVtigerLinkRepository } from "./repositories/vehicle-stock-vtiger-link-repository.mjs";
import { StockUsageVtigerLinkRepository } from "./repositories/stock-usage-vtiger-link-repository.mjs";

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

export function resolveVehicleStockDependencies(payload, vehicleLinks, stockItemLinks) {
  const vehicleId = payload.vehicle_id ?? payload.vems_vehicle_id;
  const stockItemId = payload.stock_item_id ?? payload.vems_stock_item_id;
  const vehicle = vehicleLinks.findByVehicleId(vehicleId);
  const item = stockItemLinks.findByStockItemId(stockItemId);
  if (!vehicle?.remote_id || vehicle.sync_status !== "succeeded" || !item?.remote_id || item.sync_status !== "succeeded") {
    const error = new Error("Vehicle and stock item Vtiger linkages are pending"); error.code = "VTIGER_DEPENDENCY_PENDING"; error.classification = error.code; error.retryable = true; throw error;
  }
  return { vehicleId, stockItemId, vehicle, item };
}

export async function runSyncWorkerService(options = {}) {
  const config = options.config ?? loadSyncWorkerConfig();
  const db = options.db ?? new SqliteClient(config.dbPath);
  const syncIntents = options.syncIntents ?? new SyncIntentRepository(db);
  const vtigerLinks = options.vtigerLinks ?? new VtigerLinkRepository(db);
  const assignmentLinks = options.assignmentLinks ?? new AssignmentVtigerLinkRepository(db);
  const vehicleLinks = options.vehicleLinks ?? new VehicleVtigerLinkRepository(db);
  const personnelLinks = options.personnelLinks ?? new PersonnelVtigerLinkRepository(db);
  const assignmentPersonnelLinks = options.assignmentPersonnelLinks ?? new AssignmentPersonnelVtigerLinkRepository(db);
  const stockItemLinks = options.stockItemLinks ?? new StockItemVtigerLinkRepository(db);
  const vehicleStockLinks = options.vehicleStockLinks ?? new VehicleStockVtigerLinkRepository(db);
  const stockUsageLinks = options.stockUsageLinks ?? new StockUsageVtigerLinkRepository(db);
  const transport = options.transport ?? unsupportedTransport;
  const openemrTransport = options.openemrTransport ?? createOpenEmrTransportFromEnv() ?? transport;
  const vtigerTransport = options.vtigerTransport ?? createVtigerTransportFromEnv() ?? transport;

  const vtiger = options.vtiger ?? new VtigerAdapterClient({ transport: vtigerTransport });
  const workerVtiger = {
    createIncidentMirror: (...args) => vtiger.createIncidentMirror(...args),
    updateIncidentMirror: (...args) => vtiger.updateIncidentMirror(...args),
    recordStockUsageMirror: (...args) => vtiger.recordStockUsageMirror(...args),
    createVehicleMirror: (payload) => vtiger.createVehicleMirror({ ...payload, assigned_user_id: payload?.assigned_user_id ?? process.env.VTIGER_ASSIGNED_USER_ID }),
    updateVehicleMirror: (...args) => vtiger.updateVehicleMirror(...args),
    createPersonnelMirror: (payload) => vtiger.createPersonnelMirror({ ...payload, assigned_user_id: payload?.assigned_user_id ?? process.env.VTIGER_ASSIGNED_USER_ID }),
    updatePersonnelMirror: (...args) => vtiger.updatePersonnelMirror(...args),
    createStockItemMirror: (payload) => vtiger.createStockItemMirror(payload),
    updateStockItemMirror: (...args) => vtiger.updateStockItemMirror(...args),
    createVehicleStockMirror: async (payload) => {
      const { vehicleId, stockItemId, vehicle, item } = resolveVehicleStockDependencies(payload, vehicleLinks, stockItemLinks);
      return vtiger.createVehicleStockMirror({ ...payload, vehicle_id: vehicleId, stock_item_id: stockItemId, vehicle_remote_id: vehicle.remote_id, stock_item_remote_id: item.remote_id, assigned_user_id: payload?.assigned_user_id ?? process.env.VTIGER_ASSIGNED_USER_ID });
    },
    updateVehicleStockMirror: async (payload) => {
      const link = vehicleStockLinks.find(payload.vehicle_id, payload.stock_item_id);
      if (!link?.remote_id) { const error = new Error("Vehicle stock Vtiger linkage is not established"); error.code = "VTIGER_REMOTE_NOT_FOUND"; error.classification = error.code; throw error; }
      const vehicle = vehicleLinks.findByVehicleId(payload.vehicle_id); const item = stockItemLinks.findByStockItemId(payload.stock_item_id);
      return vtiger.updateVehicleStockMirror({ ...payload, remote_id: link.remote_id, vehicle_remote_id: vehicle?.remote_id, stock_item_remote_id: item?.remote_id, assigned_user_id: payload?.assigned_user_id ?? process.env.VTIGER_ASSIGNED_USER_ID });
    },
    recordStockUsageMirror: async (payload) => {
      const item = stockItemLinks.findByStockItemId(payload.stock_item_id);
      if (!item?.remote_id || item.sync_status !== "succeeded") { const error = new Error("Stock item Vtiger linkage is pending"); error.code = "VTIGER_DEPENDENCY_PENDING"; error.classification = error.code; error.retryable = true; throw error; }
      let vehicleRemoteId = null;
      if (payload.vehicle_id) { const vehicle = vehicleLinks.findByVehicleId(payload.vehicle_id); if (!vehicle?.remote_id || vehicle.sync_status !== "succeeded") { const error = new Error("Vehicle Vtiger linkage is pending"); error.code = "VTIGER_DEPENDENCY_PENDING"; error.classification = error.code; error.retryable = true; throw error; } vehicleRemoteId = vehicle.remote_id; }
      return vtiger.recordStockUsageMirror({ ...payload, stock_item_remote_id: item.remote_id, vehicle_remote_id: vehicleRemoteId, assigned_user_id: payload?.assigned_user_id ?? process.env.VTIGER_ASSIGNED_USER_ID });
    },
    async createAssignmentMirror(payload) {
      const incident = vtigerLinks.findByIncidentId(payload.incident_id);
      if (!incident?.remote_id || incident.sync_status !== "succeeded") {
        const error = new Error("Incident Vtiger linkage is pending");
        error.code = "VTIGER_DEPENDENCY_PENDING";
        error.classification = error.code;
        error.retryable = true;
        throw error;
      }
      const vehicle = vehicleLinks.findByVehicleId(payload.vems_vehicle_id);
      if (!vehicle?.remote_id || vehicle.sync_status !== "succeeded") {
        const error = new Error("Vehicle Vtiger linkage is pending"); error.code = "VTIGER_DEPENDENCY_PENDING"; error.classification = error.code; error.retryable = true; throw error;
      }
      const crewIds = Array.isArray(payload.crew_ids) ? [...new Set(payload.crew_ids)].sort() : String(payload.vems_crew_ids ?? "").split(",").filter(Boolean).sort();
      const requiredPersonnel = [];
      const personnelIntegrationActive = personnelLinks.db?.queryOne("SELECT COUNT(*) AS count FROM personnel;")?.count > 0;
      for (const staffId of personnelIntegrationActive ? crewIds : []) {
        const link = personnelLinks.findByStaffId(staffId);
        if (!link?.remote_id || link.sync_status !== "succeeded") {
          const error = new Error(`Personnel Vtiger linkage is pending for ${staffId}`); error.code = "VTIGER_DEPENDENCY_PENDING"; error.classification = error.code; error.retryable = true; throw error;
        }
        requiredPersonnel.push({ staff_id: staffId, personnel_remote_id: link.remote_id, external_key: `${process.env.VTIGER_SOURCE_NAMESPACE ?? "vems"}:assignment-crew:${payload.assignment_id}:${staffId}`, assignment_crew_id: `${process.env.VTIGER_SOURCE_NAMESPACE ?? "vems"}:assignment-crew:${payload.assignment_id}:${staffId}` });
      }
      return vtiger.createAssignmentMirror({ ...payload, crew_ids: crewIds, incident_remote_id: incident.remote_id, vems_incident_remote_id: incident.remote_id, incident_ref: incident.remote_id, vehicle_ref: vehicle.remote_id, personnel_links: requiredPersonnel });
    },
    async updateAssignmentMirror(payload) {
      const link = assignmentLinks.findByAssignmentId(payload.assignment_id);
      if (!link?.remote_id) {
        const error = new Error("Assignment Vtiger linkage is not established");
        error.code = "VTIGER_REMOTE_NOT_FOUND";
        error.classification = error.code;
        throw error;
      }
      const vehicle = vehicleLinks.findByVehicleId(payload.vems_vehicle_id);
      return vtiger.updateAssignmentMirror({ ...payload, remote_id: link.remote_id, incident_remote_id: link.incident_remote_id, vems_incident_remote_id: link.incident_remote_id, vehicle_ref: vehicle?.remote_id ?? null });
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
          for (const junction of result.junctions ?? []) {
            assignmentPersonnelLinks.upsert({ assignment_id: intent.payload.assignment_id, staff_id: junction.staff_id, assignment_remote_id: result.remote_id, personnel_remote_id: personnelLinks.findByStaffId(junction.staff_id)?.remote_id ?? null, junction_remote_id: junction.remote_id, junction_remote_number: junction.remote_number ?? null, external_key: junction.external_key, sync_status: "succeeded", last_error_code: null, create_correlation_id: current?.create_correlation_id ?? intent.correlation_id, last_correlation_id: intent.correlation_id, last_synced_at: now, created_at: now, updated_at: now });
          }
          syncIntents.markSucceeded(intent.intent_id, now);
        });
        return true;
      }
      if (intent.entity_type === "vehicle") {
        const current = vehicleLinks.findByVehicleId(intent.payload.vehicle_id);
        db.withTransaction(() => {
          vehicleLinks.upsert({ vehicle_id: intent.payload.vehicle_id, remote_id: result.remote_id, remote_number: result.remote_number ?? null, external_key: result.external_key ?? current?.external_key ?? `${process.env.VTIGER_SOURCE_NAMESPACE ?? "vems"}:vehicle:${intent.payload.vehicle_id}`, create_correlation_id: current?.create_correlation_id ?? intent.correlation_id, last_correlation_id: intent.correlation_id, sync_status: "succeeded", last_error_code: null, last_synced_at: now, created_at: current?.created_at ?? now, updated_at: now });
          syncIntents.markSucceeded(intent.intent_id, now);
        });
        return true;
      }
      if (intent.entity_type === "personnel") {
        const current = personnelLinks.findByStaffId(intent.payload.staff_id);
        db.withTransaction(() => {
          personnelLinks.upsert({ staff_id: intent.payload.staff_id, remote_id: result.remote_id, remote_number: result.remote_number ?? null, external_key: result.external_key ?? current?.external_key ?? `${process.env.VTIGER_SOURCE_NAMESPACE ?? "vems"}:personnel:${intent.payload.staff_id}`, create_correlation_id: current?.create_correlation_id ?? intent.correlation_id, last_correlation_id: intent.correlation_id, sync_status: "succeeded", last_error_code: null, last_synced_at: now, created_at: current?.created_at ?? now, updated_at: now });
          syncIntents.markSucceeded(intent.intent_id, now);
        });
        return true;
      }
      if (intent.entity_type === "stock_item") {
        const current = stockItemLinks.findByStockItemId(intent.payload.stock_item_id);
        db.withTransaction(() => { stockItemLinks.upsert({ stock_item_id: intent.payload.stock_item_id, remote_id: result.remote_id, remote_number: result.remote_number ?? null, external_key: result.external_key ?? current?.external_key ?? `${process.env.VTIGER_SOURCE_NAMESPACE ?? "vems"}:stock-item:${intent.payload.stock_item_id}`, create_correlation_id: current?.create_correlation_id ?? intent.correlation_id, last_correlation_id: intent.correlation_id, sync_status: "succeeded", last_error_code: null, last_synced_at: now, created_at: current?.created_at ?? now, updated_at: now }); syncIntents.markSucceeded(intent.intent_id, now); });
        return true;
      }
      if (intent.entity_type === "vehicle_stock") {
        const vehicleId = intent.payload.vehicle_id ?? intent.payload.vems_vehicle_id;
        const stockItemId = intent.payload.stock_item_id ?? intent.payload.vems_stock_item_id;
        const current = vehicleStockLinks.find(vehicleId, stockItemId);
        db.withTransaction(() => { vehicleStockLinks.upsert({ vehicle_id: vehicleId, stock_item_id: stockItemId, remote_id: result.remote_id, remote_number: result.remote_number ?? null, external_key: result.external_key ?? current?.external_key ?? `${process.env.VTIGER_SOURCE_NAMESPACE ?? "vems"}:vehicle-stock:${vehicleId}:${stockItemId}`, create_correlation_id: current?.create_correlation_id ?? intent.correlation_id, last_correlation_id: intent.correlation_id, sync_status: "succeeded", last_error_code: null, last_synced_at: now, created_at: current?.created_at ?? now, updated_at: now }); syncIntents.markSucceeded(intent.intent_id, now); });
        return true;
      }
      if (intent.entity_type === "stock_usage") {
        const current = stockUsageLinks.find(intent.payload.stock_usage_id);
        db.withTransaction(() => { stockUsageLinks.upsert({ stock_usage_id: intent.payload.stock_usage_id, remote_id: result.remote_id, remote_number: result.remote_number ?? null, external_key: result.external_key ?? current?.external_key ?? `${process.env.VTIGER_SOURCE_NAMESPACE ?? "vems"}:stock-usage:${intent.payload.stock_usage_id}`, create_correlation_id: current?.create_correlation_id ?? intent.correlation_id, last_correlation_id: intent.correlation_id, sync_status: "succeeded", last_error_code: null, last_synced_at: now, created_at: current?.created_at ?? now, updated_at: now }); syncIntents.markSucceeded(intent.intent_id, now); });
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
      if (intent.entity_type === "vehicle") {
        vehicleLinks.markFailure(intent.payload.vehicle_id, error?.code ?? error?.classification ?? "DOWNSTREAM_UNAVAILABLE", state.status, new Date().toISOString());
        return;
      }
      if (intent.entity_type === "personnel") {
        personnelLinks.markFailure(intent.payload.staff_id, error?.code ?? error?.classification ?? "DOWNSTREAM_UNAVAILABLE", state.status, new Date().toISOString());
        return;
      }
      if (intent.entity_type === "stock_item") { stockItemLinks.markFailure(intent.payload.stock_item_id, error?.code ?? error?.classification ?? "DOWNSTREAM_UNAVAILABLE", state.status, new Date().toISOString()); return; }
      if (intent.entity_type === "vehicle_stock") { vehicleStockLinks.markFailure(intent.payload.vehicle_id ?? intent.payload.vems_vehicle_id, intent.payload.stock_item_id ?? intent.payload.vems_stock_item_id, error?.code ?? error?.classification ?? "DOWNSTREAM_UNAVAILABLE", state.status, new Date().toISOString()); return; }
      if (intent.entity_type === "stock_usage") { stockUsageLinks.markFailure(intent.payload.stock_usage_id, error?.code ?? error?.classification ?? "DOWNSTREAM_UNAVAILABLE", state.status, new Date().toISOString()); return; }
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
    `[sync-worker] starting service db_path=${config.dbPath} poll_ms=${config.pollIntervalMs} batch_size=${config.batchSize} max_attempts=${config.maxAttempts} vtiger_owner_set=${Boolean(process.env.VTIGER_ASSIGNED_USER_ID)}`
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
