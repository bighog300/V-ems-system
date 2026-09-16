import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach, beforeEach } from "@jest/globals";

import IncidentDetailScreen from "../src/screens/IncidentDetailScreen.tsx";
import { __resetPatientHistoryStoreForTests, getPatientHistory, isPatientHistoryPurged, setPatientHistory } from "../src/history/patientHistoryStore.ts";
import type { Session } from "../src/auth/session.ts";
import type { AssignedJob } from "../src/api/assignments.ts";
import type { PatientHistory } from "../src/api/patientHistory.ts";

const session: Session = {
  apiBaseUrl: "https://api.example.test",
  authToken: "token-123",
  actorId: "crew-1",
  actorRole: "field_crew"
};

const job: AssignedJob = {
  assignment_id: "ASN-000001",
  status: "Assigned",
  vehicle_status: "Assigned",
  vehicle_id: "AMB-901",
  crew_ids: ["crew-1"],
  updated_at: "2026-09-16T00:00:00.000Z",
  incident: {
    incident_id: "INC-000001",
    priority: "high",
    status: "Assigned",
    location_summary: "1400 Riverside Dr",
    created_at: "2026-09-16T00:00:00.000Z"
  }
};

describe("IncidentDetailScreen status workflow", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("shows the status stepper with a Navigate button, and advances status when the primary action is pressed", async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
      calls.push(`${options.method ?? "GET"} ${url}`);
      if (url.includes("/patient-cases")) return new Response(JSON.stringify({ patient_cases: [] }), { status: 200 });
      if (options.method === "PATCH") return new Response(JSON.stringify({ incident_id: "INC-000001", status: "Crew Acknowledged", updated_at: "2026-09-16T10:05:00.000Z" }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId } = await render(<IncidentDetailScreen job={job} session={session} onBack={jest.fn()} onSelectPatientCase={jest.fn()} />);

    await waitFor(() => expect(getByTestId("incident-status-stepper")).toBeTruthy());
    expect(getByTestId("navigate-button")).toBeTruthy();
    expect(getByTestId("status-primary-action").props.accessibilityLabel).toBe("Acknowledge");

    await fireEvent.press(getByTestId("status-primary-action"));

    await waitFor(() => expect(getByTestId("status-primary-action").props.accessibilityLabel).toBe("Depart to scene"));
    expect(calls).toContain("PATCH https://api.example.test/api/incidents/INC-000001");
  });

  it("shows an error and keeps the button usable when the status update fails", async () => {
    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
      if (url.includes("/patient-cases")) return new Response(JSON.stringify({ patient_cases: [] }), { status: 200 });
      if (options.method === "PATCH") return new Response(JSON.stringify({ error: { message: "Invalid transition" } }), { status: 409 });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId } = await render(<IncidentDetailScreen job={job} session={session} onBack={jest.fn()} onSelectPatientCase={jest.fn()} />);
    await waitFor(() => expect(getByTestId("status-primary-action")).toBeTruthy());

    await fireEvent.press(getByTestId("status-primary-action"));

    await waitFor(() => expect(getByTestId("status-stepper-error")).toBeTruthy());
    expect(getByTestId("status-primary-action").props.accessibilityLabel).toBe("Acknowledge");
  });
});

describe("IncidentDetailScreen — on-device history purge", () => {
  const originalFetch = global.fetch;

  const sampleHistory: PatientHistory = {
    patient_case_id: "PCR-000001",
    openemr_patient_id: "OE-101",
    as_of: "2026-09-16T00:00:00.000Z",
    medications: [],
    encounters: []
  };

  beforeEach(() => {
    __resetPatientHistoryStoreForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    __resetPatientHistoryStoreForTests();
  });

  it("purges on-device history for every patient case once the incident reaches At Destination", async () => {
    setPatientHistory("PCR-000001", sampleHistory);
    setPatientHistory("PCR-000002", { ...sampleHistory, patient_case_id: "PCR-000002" });

    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
      if (url.includes("/patient-cases")) {
        return new Response(
          JSON.stringify({
            patient_cases: [
              { patient_case_id: "PCR-000001", incident_id: "INC-000001", patient_sequence: 1, status: "Transporting", temporary_label: null, assignment_id: null, vehicle_id: null, lead_clinician_id: null, verification_status: "verified", openemr_patient_id: "OE-101", closure_ready: false, created_at: "2026-09-16T00:00:00.000Z", updated_at: "2026-09-16T00:00:00.000Z" },
              { patient_case_id: "PCR-000002", incident_id: "INC-000001", patient_sequence: 2, status: "Transporting", temporary_label: null, assignment_id: null, vehicle_id: null, lead_clinician_id: null, verification_status: "verified", openemr_patient_id: "OE-102", closure_ready: false, created_at: "2026-09-16T00:00:00.000Z", updated_at: "2026-09-16T00:00:00.000Z" }
            ]
          }),
          { status: 200 }
        );
      }
      if (options.method === "PATCH") return new Response(JSON.stringify({ incident_id: "INC-000001", status: "At Destination", updated_at: "2026-09-16T10:05:00.000Z" }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId } = await render(<IncidentDetailScreen job={{ ...job, incident: { ...job.incident!, status: "Transporting" } }} session={session} onBack={jest.fn()} onSelectPatientCase={jest.fn()} />);

    await waitFor(() => expect(getByTestId("status-primary-action")).toBeTruthy());
    await fireEvent.press(getByTestId("status-primary-action"));

    await waitFor(() => expect(isPatientHistoryPurged("PCR-000001")).toBe(true));
    expect(isPatientHistoryPurged("PCR-000002")).toBe(true);
    expect(getPatientHistory("PCR-000001")).toBeNull();
    expect(getPatientHistory("PCR-000002")).toBeNull();
  });

  it("does not purge on-device history for a status transition short of delivery", async () => {
    setPatientHistory("PCR-000001", sampleHistory);

    global.fetch = jest.fn(async (url: string, options: RequestInit = {}) => {
      if (url.includes("/patient-cases")) {
        return new Response(
          JSON.stringify({
            patient_cases: [
              { patient_case_id: "PCR-000001", incident_id: "INC-000001", patient_sequence: 1, status: "En Route", temporary_label: null, assignment_id: null, vehicle_id: null, lead_clinician_id: null, verification_status: "verified", openemr_patient_id: "OE-101", closure_ready: false, created_at: "2026-09-16T00:00:00.000Z", updated_at: "2026-09-16T00:00:00.000Z" }
            ]
          }),
          { status: 200 }
        );
      }
      if (options.method === "PATCH") return new Response(JSON.stringify({ incident_id: "INC-000001", status: "Crew Acknowledged", updated_at: "2026-09-16T10:05:00.000Z" }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId } = await render(<IncidentDetailScreen job={job} session={session} onBack={jest.fn()} onSelectPatientCase={jest.fn()} />);

    await waitFor(() => expect(getByTestId("status-primary-action")).toBeTruthy());
    await fireEvent.press(getByTestId("status-primary-action"));

    await waitFor(() => expect(getByTestId("status-primary-action").props.accessibilityLabel).toBe("Depart to scene"));
    expect(isPatientHistoryPurged("PCR-000001")).toBe(false);
    expect(getPatientHistory("PCR-000001")).toEqual(sampleHistory);
  });
});
