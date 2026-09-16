import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";

import IncidentDetailScreen from "../src/screens/IncidentDetailScreen.tsx";
import type { Session } from "../src/auth/session.ts";
import type { AssignedJob } from "../src/api/assignments.ts";

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
