/**
 * Mobile telemetry (Stage 12 milestone 12e), closing the "mobile telemetry
 * that excludes PHI/secrets" item carried over from issue #68 -- no
 * telemetry pipeline existed at all before this. `TelemetryEvent`'s
 * discriminated union is a closed, hand-reviewed allowlist: every field on
 * every variant is a status/count/enum/duration, never a patient
 * demographic or clinical value, a token, or a secret. Adding a new event
 * means extending this union (and re-reviewing it for PHI/secrets), not
 * passing an arbitrary object through -- the type system is the PHI-safety
 * guarantee here, the same way the server-side logging scan
 * (scripts/lint.mjs) is for the backend.
 *
 * No real collection backend exists yet (the plan doc scopes this stage to
 * the safety guarantee, not standing up an analytics pipeline) -- the
 * default sink just logs locally via console.info so the pipeline is live
 * and exercised end-to-end; `setTelemetrySink` lets a real destination be
 * plugged in later without touching any call site.
 */

export type TelemetryEvent =
  | { name: "app_launched" }
  | { name: "sign_in_succeeded"; role: string }
  | { name: "sign_in_failed"; reason: "invalid_credentials" | "network_error" | "unknown" }
  | { name: "sync_cycle_completed"; attempted: number; acknowledged: number; retrying: number; failed: number; conflicted: number }
  | { name: "api_error"; path: string; status: number; code?: string };

// Runtime mirror of the TelemetryEvent union above. TypeScript's excess-
// property check already rejects an unknown field on an object literal
// passed directly to recordTelemetryEvent, but that's a compile-time-only
// guarantee -- this allowlist is the same protection at runtime, so a
// value that reaches this module already loosely typed (e.g. via `as any`,
// or assembled dynamically) still can't carry an extra field through to
// the sink.
const EVENT_FIELDS: Record<TelemetryEvent["name"], readonly string[]> = {
  app_launched: [],
  sign_in_succeeded: ["role"],
  sign_in_failed: ["reason"],
  sync_cycle_completed: ["attempted", "acknowledged", "retrying", "failed", "conflicted"],
  api_error: ["path", "status", "code"]
};

function redact(event: TelemetryEvent): TelemetryEvent {
  const allowedFields = EVENT_FIELDS[event.name] ?? [];
  const redacted: Record<string, unknown> = { name: event.name };
  for (const field of allowedFields) {
    if (field in event) redacted[field] = (event as unknown as Record<string, unknown>)[field];
  }
  return redacted as TelemetryEvent;
}

export interface TelemetrySink {
  record(event: TelemetryEvent, timestamp: string): void;
}

const consoleSink: TelemetrySink = {
  record(event, timestamp) {
    // eslint-disable-next-line no-console
    console.info("[telemetry]", timestamp, event);
  }
};

let activeSink: TelemetrySink = consoleSink;

/** Swaps the destination a telemetry event is handed to (tests, or a future real pipeline). Never changes what's redacted before it gets there. */
export function setTelemetrySink(sink: TelemetrySink): void {
  activeSink = sink;
}

export function resetTelemetrySink(): void {
  activeSink = consoleSink;
}

export function recordTelemetryEvent(event: TelemetryEvent): void {
  activeSink.record(redact(event), new Date().toISOString());
}
