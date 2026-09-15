import { withCache, type CachedResult } from "./cachedRequest.ts";
import { requestJson } from "./httpClient.ts";

export interface IncidentSummary {
  incident_id: string;
  priority: string;
  status: string;
  location_summary: string | null;
  created_at: string;
}

export interface AssignedJob {
  assignment_id: string;
  status: string;
  vehicle_status: string;
  vehicle_id: string;
  crew_ids: string[];
  updated_at: string;
  incident: IncidentSummary | null;
}

export interface ListMyAssignmentsArgs {
  apiBaseUrl: string;
  authToken: string;
  deviceId?: string;
  fetchImpl?: typeof fetch;
}

export async function listMyAssignmentsCached({ apiBaseUrl, authToken, deviceId, fetchImpl = fetch }: ListMyAssignmentsArgs): Promise<CachedResult<AssignedJob[]>> {
  return withCache(`assignments:mine`, () => listMyAssignments({ apiBaseUrl, authToken, deviceId, fetchImpl }));
}

export async function listMyAssignments({ apiBaseUrl, authToken, deviceId, fetchImpl = fetch }: ListMyAssignmentsArgs): Promise<AssignedJob[]> {
  const result = await requestJson<{ assignments: AssignedJob[] }>(fetchImpl, `${apiBaseUrl}/api/assignments/mine`, {
    config: { authToken, deviceId }
  });
  return result.data?.assignments ?? [];
}
