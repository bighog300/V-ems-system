import { requestJson } from "./httpClient.ts";
import type { ApiConfig } from "./patientCases.ts";

/**
 * The crew-facing slice of the incident status pipeline
 * (packages/shared/src/state-machine.mjs is the source of truth server-side
 * -- duplicated here rather than imported, matching how apps/web-control's
 * board.mjs already keeps its own local copy of incident status strings
 * rather than depending on @vems/shared from a browser/mobile bundle).
 * Starts at "Assigned": New/Awaiting Dispatch are dispatcher-side states a
 * crew never acts on.
 *
 * The full state machine branches at two points this linear pipeline
 * flattens for the primary action button: "On Scene" can go to either
 * "Treating On Scene" or straight to "Transporting", and "Treating On
 * Scene" can go to either "Transporting" or straight to "Handover Complete"
 * (treated-but-not-transported). The primary action always advances toward
 * transport; the branch is offered as a secondary action only at the step
 * where it's actually available (see STEPPER_STEPS/secondary handling in
 * IncidentStatusStepper.tsx).
 */
export const INCIDENT_STATUS_PIPELINE = [
  "Assigned",
  "Crew Acknowledged",
  "En Route",
  "On Scene",
  "Transporting",
  "At Destination",
  "Handover Complete"
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUS_PIPELINE)[number] | "Treating On Scene";

export interface IncidentStatusAction {
  action: string;
  label: string;
}

/** The primary (transport-advancing) action available from a given status, or null once there's nowhere further for this button to go. */
export function primaryActionFor(status: string): IncidentStatusAction | null {
  switch (status) {
    case "Assigned":
      return { action: "acknowledge_assignment", label: "Acknowledge" };
    case "Crew Acknowledged":
      return { action: "depart_to_scene", label: "Depart to scene" };
    case "En Route":
      return { action: "arrive_scene", label: "Arrived on scene" };
    case "On Scene":
      return { action: "begin_transport", label: "Begin transport" };
    case "Treating On Scene":
      return { action: "begin_transport", label: "Begin transport" };
    case "Transporting":
      return { action: "arrive_destination", label: "Arrived at destination" };
    case "At Destination":
      return { action: "complete_handover", label: "Complete handover" };
    default:
      return null;
  }
}

/** The secondary (branch) action available from a given status, if any. */
export function secondaryActionFor(status: string): IncidentStatusAction | null {
  switch (status) {
    case "On Scene":
      return { action: "begin_treatment", label: "Begin treatment on scene" };
    case "Treating On Scene":
      return { action: "complete_non_transport_handover", label: "Complete without transport" };
    default:
      return null;
  }
}

export interface UpdateIncidentStatusArgs extends ApiConfig {
  incidentId: string;
  action: string;
}

export interface IncidentStatusResult {
  incident_id: string;
  status: string;
  updated_at: string;
}

/**
 * Not routed through the offline outbox (unlike patient-case-scoped
 * mutations in offlineMutation.ts) -- the outbox's queue/replay model is
 * built around patient_case_id scoping end to end (outboxStore.ts,
 * syncEngine.ts), and an incident status transition isn't patient-case
 * scoped at all. Extending the outbox to a second scope is real work of
 * its own, not a safe thing to bolt on here -- tracked as a known
 * follow-up, not silently worked around. A status update attempted while
 * offline fails the same way any other unqueued request does today; the
 * crew retries once back online.
 */
export async function updateIncidentStatus({ apiBaseUrl, authToken, deviceId, fetchImpl = fetch, incidentId, action }: UpdateIncidentStatusArgs): Promise<IncidentStatusResult> {
  const result = await requestJson<IncidentStatusResult>(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}`, {
    method: "PATCH",
    payload: { action },
    config: { authToken, deviceId }
  });
  if (!result.data) throw new Error("Incident status update returned no data");
  return result.data;
}
