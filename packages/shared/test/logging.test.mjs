import test from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "../src/logging.mjs";

function captureConsole(level, fn) {
  const method = level === "warn" ? "warn" : level === "error" ? "error" : "log";
  const original = console[method];
  const lines = [];
  console[method] = (line) => lines.push(line);
  try {
    fn();
  } finally {
    console[method] = original;
  }
  return lines.map((line) => JSON.parse(line));
}

test("logs a plain fields object as-is (level, message, service_name, timestamp added)", () => {
  const logger = createLogger({ serviceName: "test-service" });
  const [entry] = captureConsole("info", () => logger.info("something_happened", { correlation_id: "abc", status: 200 }));
  assert.equal(entry.service_name, "test-service");
  assert.equal(entry.level, "info");
  assert.equal(entry.message, "something_happened");
  assert.equal(entry.correlation_id, "abc");
  assert.equal(entry.status, 200);
  assert.equal(typeof entry.timestamp, "string");
});

test("PHI-safety: an Error value is narrowed to name/message/stack, dropping every other own property", () => {
  const logger = createLogger({ serviceName: "test-service" });
  const error = new Error("duplicate key value violates unique constraint");
  // Mirrors what a real Postgres driver error carries: .detail (and
  // friends like .hint/.where/.table/.constraint) can embed the actual
  // conflicting column VALUE, not just a generic message -- these must
  // never reach a log line, regardless of which field a future call site
  // happens to attach them under.
  error.detail = "Key (ssn)=(123-45-6789) already exists.";
  error.hint = "some hint referencing sensitive data";
  error.table = "patient_case_demographics";
  error.code = "23505";

  const [entry] = captureConsole("error", () => logger.error("request_failed_unhandled", { error }));

  assert.deepEqual(Object.keys(entry.error).sort(), ["message", "name", "stack"]);
  assert.equal(entry.error.message, "duplicate key value violates unique constraint");
  assert.equal(JSON.stringify(entry).includes("123-45-6789"), false);
  assert.equal(JSON.stringify(entry).includes("sensitive data"), false);
});

test("PHI-safety: an Error nested inside another object is still narrowed", () => {
  const logger = createLogger({ serviceName: "test-service" });
  const error = new Error("boom");
  error.detail = "patient_name=Jane Doe";
  const [entry] = captureConsole("warn", () => logger.warn("nested", { context: { cause: error } }));
  assert.deepEqual(Object.keys(entry.context.cause).sort(), ["message", "name", "stack"]);
  assert.equal(JSON.stringify(entry).includes("Jane Doe"), false);
});

test("debug/warn/error route to the matching console method; info/debug route to console.log", () => {
  const logger = createLogger({ serviceName: "test-service", level: "debug" });
  assert.equal(captureConsole("log", () => logger.debug("d", {})).length, 1);
  assert.equal(captureConsole("log", () => logger.info("i", {})).length, 1);
  assert.equal(captureConsole("warn", () => logger.warn("w", {})).length, 1);
  assert.equal(captureConsole("error", () => logger.error("e", {})).length, 1);
});

test("log level filtering suppresses lower-priority levels", () => {
  const logger = createLogger({ serviceName: "test-service", level: "warn" });
  assert.equal(captureConsole("log", () => logger.info("suppressed", {})).length, 0);
  assert.equal(captureConsole("warn", () => logger.warn("kept", {})).length, 1);
});
