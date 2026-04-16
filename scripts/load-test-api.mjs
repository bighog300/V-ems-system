#!/usr/bin/env node

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:8080";
const totalRequests = Number.parseInt(process.env.LOAD_TEST_REQUESTS ?? "50", 10);
const concurrency = Number.parseInt(process.env.LOAD_TEST_CONCURRENCY ?? "5", 10);
const role = process.env.LOAD_TEST_ROLE ?? "dispatcher";
const timeoutMs = Number.parseInt(process.env.LOAD_TEST_TIMEOUT_MS ?? "15000", 10);
const includeMetricsSnapshot = process.env.LOAD_TEST_INCLUDE_METRICS_SNAPSHOT !== "false";
const endpointPath = process.env.LOAD_TEST_ENDPOINT_PATH ?? "/api/incidents";

function createIncidentPayload(index) {
  return {
    call: { call_source: "phone", received_at: new Date().toISOString() },
    incident: {
      category: "medical_emergency",
      priority: "high",
      description: `Load test request ${index}`,
      address: `Load Test Ave ${index}`,
      patient_count: 1
    }
  };
}

async function readGatewayMetricsSnapshot() {
  try {
    const response = await fetch(`${baseUrl}/api/support/metrics`, { method: "GET" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function runSingle(index) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${endpointPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-role": role,
        "x-actor-id": `LOAD-${String(index).padStart(6, "0")}`,
        "idempotency-key": `load-test-${index}-${Date.now()}`
      },
      body: JSON.stringify(createIncidentPayload(index)),
      signal: controller.signal
    });

    return {
      status: response.status,
      elapsedMs: performance.now() - started,
      ok: response.ok,
      error_type: null
    };
  } catch (error) {
    return {
      status: null,
      elapsedMs: performance.now() - started,
      ok: false,
      error_type: error?.name === "AbortError" ? "timeout" : "network_error"
    };
  } finally {
    clearTimeout(timer);
  }
}

function toFixedNumber(value) {
  return Number(value.toFixed(2));
}

function percentile(durations, p) {
  if (durations.length === 0) return 0;
  const rank = Math.ceil((p / 100) * durations.length) - 1;
  const idx = Math.max(0, Math.min(durations.length - 1, rank));
  return toFixedNumber(durations[idx]);
}

function summarizeResults({ startedAtIso, finishedAtIso, startedAtMs, finishedAtMs, results, beforeMetrics, afterMetrics }) {
  const durations = results.map((item) => item.elapsedMs).sort((a, b) => a - b);
  const successCount = results.filter((item) => item.ok).length;
  const failures = results.filter((item) => !item.ok);
  const totalDurationMs = finishedAtMs - startedAtMs;
  const throughputRps = totalDurationMs > 0 ? (results.length / totalDurationMs) * 1000 : 0;

  const statusCounts = results.reduce((acc, result) => {
    const key = result.status === null ? "transport_error" : String(result.status);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const transportErrors = failures.reduce((acc, result) => {
    if (!result.error_type) return acc;
    acc[result.error_type] = (acc[result.error_type] ?? 0) + 1;
    return acc;
  }, {});

  const latency = {
    min_ms: durations.length === 0 ? 0 : toFixedNumber(durations[0]),
    max_ms: durations.length === 0 ? 0 : toFixedNumber(durations[durations.length - 1]),
    avg_ms: durations.length === 0 ? 0 : toFixedNumber(durations.reduce((sum, value) => sum + value, 0) / durations.length),
    p50_ms: percentile(durations, 50),
    p95_ms: percentile(durations, 95),
    p99_ms: percentile(durations, 99)
  };

  return {
    started_at: startedAtIso,
    finished_at: finishedAtIso,
    target: baseUrl,
    endpoint_path: endpointPath,
    total_requests: totalRequests,
    concurrency,
    timeout_ms: timeoutMs,
    duration_ms: toFixedNumber(totalDurationMs),
    throughput_rps: toFixedNumber(throughputRps),
    success_count: successCount,
    failure_count: failures.length,
    status_counts: statusCounts,
    transport_errors: transportErrors,
    latency,
    failures: failures.slice(0, 10).map((item) => ({
      status: item.status,
      error_type: item.error_type,
      elapsed_ms: toFixedNumber(item.elapsedMs)
    })),
    metrics_snapshot: {
      before: beforeMetrics,
      after: afterMetrics
    }
  };
}

async function run() {
  if (totalRequests <= 0 || concurrency <= 0) {
    throw new Error("LOAD_TEST_REQUESTS and LOAD_TEST_CONCURRENCY must be positive integers");
  }

  const beforeMetrics = includeMetricsSnapshot ? await readGatewayMetricsSnapshot() : null;

  const startedAtIso = new Date().toISOString();
  const startedAtMs = performance.now();
  const results = [];

  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < totalRequests) {
      const index = cursor;
      cursor += 1;
      results.push(await runSingle(index));
    }
  });

  await Promise.all(workers);

  const finishedAtMs = performance.now();
  const finishedAtIso = new Date().toISOString();
  const afterMetrics = includeMetricsSnapshot ? await readGatewayMetricsSnapshot() : null;

  const summary = summarizeResults({ startedAtIso, finishedAtIso, startedAtMs, finishedAtMs, results, beforeMetrics, afterMetrics });

  console.log(JSON.stringify(summary, null, 2));

  if (summary.failure_count > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error("load test failed", error);
  process.exitCode = 1;
});
