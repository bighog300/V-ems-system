import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";

import IncidentWorkspaceScreen from "../src/screens/IncidentWorkspaceScreen.tsx";
import type { Session } from "../src/auth/session.ts";

const session: Session = {
  apiBaseUrl: "https://api.example.test",
  authToken: "token-123",
  actorId: "crew-1",
  actorRole: "field_crew"
};

const job = {
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

describe("IncidentWorkspaceScreen", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("shows a placeholder in the detail pane until a job is selected from the rail, then shows its detail", async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith("/api/assignments/mine")) return new Response(JSON.stringify({ assignments: [job] }), { status: 200 });
      if (url.includes("/patient-cases")) return new Response(JSON.stringify({ patient_cases: [] }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId, queryByTestId } = await render(
      <IncidentWorkspaceScreen session={session} onSignedOut={jest.fn()} onOpenSyncStatus={jest.fn()} onSelectPatientCase={jest.fn()} />
    );

    expect(getByTestId("incident-workspace-placeholder")).toBeTruthy();
    await waitFor(() => expect(getByTestId("job-ASN-000001")).toBeTruthy());

    await fireEvent.press(getByTestId("job-ASN-000001"));

    await waitFor(() => expect(getByTestId("incident-detail-screen")).toBeTruthy());
    expect(queryByTestId("incident-workspace-placeholder")).toBeNull();
    // The rail (JobsListScreen) stays mounted alongside the detail pane --
    // this is a split view, not a navigation push.
    expect(getByTestId("jobs-list-screen")).toBeTruthy();
  });

  it("returns to the placeholder when the detail pane's back link is pressed, without leaving the workspace", async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith("/api/assignments/mine")) return new Response(JSON.stringify({ assignments: [job] }), { status: 200 });
      if (url.includes("/patient-cases")) return new Response(JSON.stringify({ patient_cases: [] }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId, queryByTestId } = await render(
      <IncidentWorkspaceScreen session={session} onSignedOut={jest.fn()} onOpenSyncStatus={jest.fn()} onSelectPatientCase={jest.fn()} />
    );

    await waitFor(() => expect(getByTestId("job-ASN-000001")).toBeTruthy());
    await fireEvent.press(getByTestId("job-ASN-000001"));
    await waitFor(() => expect(getByTestId("incident-detail-screen")).toBeTruthy());

    await fireEvent.press(getByTestId("back-to-jobs"));

    await waitFor(() => expect(getByTestId("incident-workspace-placeholder")).toBeTruthy());
    expect(queryByTestId("incident-detail-screen")).toBeNull();
    expect(getByTestId("jobs-list-screen")).toBeTruthy();
  });
});
