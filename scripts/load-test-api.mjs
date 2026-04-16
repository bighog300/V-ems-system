#!/usr/bin/env node

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:8080";
const totalRequests = Number.parseInt(process.env.LOAD_TEST_REQUESTS ?? "50", 10);
const concurrency = Number.parseInt(process.env.LOAD_TEST_CONCURRENCY ?? "5", 10);
const role = process.env.LOAD_TEST_ROLE ?? "dispatcher";

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

async function runSingle(index) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/incidents`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-role": role,
      "x-actor-id": `LOAD-${String(index).padStart(4, "0")}`
    },
    body: JSON.stringify(createIncidentPayload(index))
  });

  const elapsedMs = performance.now() - started;
  return {
    status: response.status,
    elapsedMs,
    ok: response.ok
  };
}

async function run() {
  const startedAt = new Date().toISOString();
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

  const durations = results.map((item) => item.elapsedMs).sort((a, b) => a - b);
  const successCount = results.filter((item) => item.ok).length;
  const failed = results.filter((item) => !item.ok);

  const percentile = (p) => {
    if (durations.length === 0) return 0;
    const idx = Math.min(durations.length - 1, Math.floor((p / 100) * durations.length));
    return Number(durations[idx].toFixed(2));
  };

  const summary = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    target: baseUrl,
    total_requests: totalRequests,
    concurrency,
    success_count: successCount,
    failure_count: failed.length,
    p50_ms: percentile(50),
    p95_ms: percentile(95),
    p99_ms: percentile(99),
    failures: failed.slice(0, 10).map((item) => ({ status: item.status, elapsed_ms: Number(item.elapsedMs.toFixed(2)) }))
  };

  console.log(JSON.stringify(summary, null, 2));

  if (failed.length > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error("load test failed", error);
  process.exitCode = 1;
});
