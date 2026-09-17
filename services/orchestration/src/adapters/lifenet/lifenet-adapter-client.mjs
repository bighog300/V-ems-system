// Stage 15 milestone 15g: Physio-Control LIFEPAK 15 integration.
//
// The LIFEPAK 15 does not publish an open Bluetooth GATT profile for live
// vitals streaming to a third-party mobile app the way the generic IEEE
// 11073 driver (15e, apps/mobile-crew/src/devices/) targets. Its actual
// connectivity is Physio-Control's LIFENET System: the monitor uploads
// case data (12-lead ECG, vitals, event log) over cellular/Wi-Fi directly
// to Physio-Control's cloud, and an EMS agency pulls case data from
// LIFENET via whatever data-sharing agreement and API Physio-Control
// provides them -- not something this session has access to, and not
// something a wire format should be fabricated for.
//
// This adapter therefore defines only V-EMS's side of that boundary:
// fetchCaseVitals() expects its transport to already return readings in
// V-EMS's own normalized shape (recorded_at plus known vital-sign
// fields). Translating Physio-Control's real LIFENET response into that
// shape is real integration work for whoever holds that data-sharing
// agreement, wired in via createLifenetTransportFromEnv()
// (../transports.mjs) once real API documentation exists -- deliberately
// left unconfigured (no default endpoint, no guessed response schema)
// rather than guessed.

const KNOWN_VITAL_FIELDS = ["heart_rate_bpm", "blood_pressure_systolic", "blood_pressure_diastolic", "respiratory_rate_bpm", "spo2_pct", "temperature_c"];

async function unsupportedTransport() {
  throw new Error("LIFENET transport is not configured");
}

function wrapTransportError(method, error) {
  const wrapped = new Error(`LIFENET adapter ${method} failed: ${error?.message ?? "Unknown transport error"}`);
  wrapped.code = error?.code ?? "DOWNSTREAM_UNAVAILABLE";
  wrapped.classification = error?.classification ?? wrapped.code;
  wrapped.cause = error;
  return wrapped;
}

/**
 * Filters a raw reading -- already expected to be in V-EMS's normalized
 * shape per the module comment above -- down to known vital-sign fields
 * plus recorded_at, dropping anything else. Rejects (returns null) a
 * reading with no valid recorded_at or no recognized vital-sign field at
 * all, rather than passing through a value V-EMS's clinical record can't
 * make sense of.
 */
function normalizeReading(raw) {
  if (!raw || typeof raw !== "object") return null;
  const recordedAtRaw = raw.recorded_at ?? raw.recordedAt;
  const parsed = recordedAtRaw ? Date.parse(recordedAtRaw) : NaN;
  if (Number.isNaN(parsed)) return null;
  const vitalSigns = {};
  for (const field of KNOWN_VITAL_FIELDS) {
    if (typeof raw[field] === "number" && Number.isFinite(raw[field])) vitalSigns[field] = raw[field];
  }
  if (Object.keys(vitalSigns).length === 0) return null;
  return { recordedAt: new Date(parsed).toISOString(), vitalSigns };
}

export class LifenetAdapterClient {
  constructor(options = {}) {
    this.transport = options.transport ?? unsupportedTransport;
  }

  /**
   * Fetches every vitals reading recorded for a LIFENET case and returns
   * them normalized, oldest first. `caseReference` is whatever identifier
   * the deployment's LIFENET data-sharing agreement uses to reference a
   * case (case ID, incident number, etc.) -- V-EMS treats it as an opaque
   * string, never parses or validates its format.
   */
  async fetchCaseVitals(caseReference) {
    let response;
    try {
      response = await this.transport({ method: "fetchCaseVitals", payload: { case_reference: caseReference } });
    } catch (error) {
      throw wrapTransportError("fetchCaseVitals", error);
    }
    const rawReadings = Array.isArray(response) ? response : Array.isArray(response?.readings) ? response.readings : [];
    return rawReadings
      .map(normalizeReading)
      .filter((reading) => reading !== null)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  }
}
