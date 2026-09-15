// Stage 12 milestone 12h: live readiness checks for every critical
// dependency the platform actually needs to function -- the database, the
// object-storage backend, and (only when connectivity checks are enabled
// for this environment) Vtiger/OpenEMR reachability. Distinct from
// server.mjs's readinessReport(), which reports static
// configuration/diagnostics; this module actually exercises each
// dependency on every call.

const DEFAULT_TIMEOUT_MS = 4000;
// Fixed content -> fixed content-addressed key, so every probe after the
// first is a cheap existence check (FilesystemObjectStorage.putObject
// skips the write when the object is already there), never an
// ever-growing pile of probe objects.
const OBJECT_STORAGE_PROBE_CONTENT = Buffer.from("vems-readiness-probe");

async function checkDatabase(db) {
  const startedAt = Date.now();
  try {
    await db.queryOne("SELECT 1;");
    return { ok: true, dialect: db.dialect, latency_ms: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, dialect: db.dialect, latency_ms: Date.now() - startedAt, error: error.message };
  }
}

async function checkObjectStorage(objectStorage) {
  const startedAt = Date.now();
  try {
    const put = await objectStorage.putObject(OBJECT_STORAGE_PROBE_CONTENT, { contentType: "text/plain" });
    const got = await objectStorage.getObject(put.key);
    if (!got || !Buffer.from(got.content).equals(OBJECT_STORAGE_PROBE_CONTENT)) {
      throw new Error("Object storage round-trip returned unexpected content");
    }
    return { ok: true, latency_ms: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, latency_ms: Date.now() - startedAt, error: error.message };
  }
}

async function pingUpstream(baseUrl, pingPath, timeoutMs) {
  const startedAt = Date.now();
  const url = new URL(pingPath ?? "/", baseUrl).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    return { checked: true, ok: response.ok, status: response.status, latency_ms: Date.now() - startedAt, url };
  } catch (error) {
    const message = error?.name === "AbortError" ? `Timed out after ${timeoutMs}ms` : (error?.message ?? "Unknown error");
    return { checked: true, ok: false, latency_ms: Date.now() - startedAt, url, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks every critical dependency live and reports whether the process is
 * actually ready to serve traffic. Database and object storage are always
 * checked (both are local/fast and required for every request this API
 * serves). Vtiger/OpenEMR reachability is only checked when connectivity
 * checks are enabled for this environment (UPSTREAM_CONNECTIVITY_CHECKS_ENABLED
 * / SMOKE_INCLUDE_UPSTREAM_CONNECTIVITY) -- same gate the existing
 * connectivity-validation scripts use -- so a readiness probe hit every few
 * seconds by an orchestrator doesn't also hammer an external system by
 * default; `healthy` only weighs upstream checks that were actually run.
 */
export async function checkDependencies(orchestration, env = process.env) {
  const [database, objectStorage] = await Promise.all([
    checkDatabase(orchestration.db),
    checkObjectStorage(orchestration.objectStorage)
  ]);

  const upstreamChecksEnabled = env.UPSTREAM_CONNECTIVITY_CHECKS_ENABLED === "true" || env.SMOKE_INCLUDE_UPSTREAM_CONNECTIVITY === "true";
  const timeoutMs = Number(env.VALIDATION_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  let vtiger = { checked: false };
  let openemr = { checked: false };
  if (upstreamChecksEnabled) {
    [vtiger, openemr] = await Promise.all([
      env.VTIGER_BASE_URL ? pingUpstream(env.VTIGER_BASE_URL, env.VTIGER_CONNECTIVITY_PING_PATH, timeoutMs) : { checked: false },
      env.OPENEMR_BASE_URL ? pingUpstream(env.OPENEMR_BASE_URL, env.OPENEMR_CONNECTIVITY_PING_PATH, timeoutMs) : { checked: false }
    ]);
  }

  const checks = [database, objectStorage, vtiger, openemr].filter((check) => check.checked !== false);
  const healthy = checks.every((check) => check.ok);

  return { healthy, database, object_storage: objectStorage, vtiger, openemr };
}
