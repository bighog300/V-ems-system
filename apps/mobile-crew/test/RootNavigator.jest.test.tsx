import { render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";
import * as Notifications from "expo-notifications";

import RootNavigator from "../src/navigation/RootNavigator.tsx";

describe("RootNavigator", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("shows the login screen when no session is stored", async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);

    const { getByTestId } = await render(<RootNavigator />);

    await waitFor(() => expect(getByTestId("login-screen")).toBeTruthy());
  });

  it("shows the app-lock screen for a restored session, then the jobs list once unlocked", async () => {
    const session = {
      apiBaseUrl: "https://api.example.test",
      authToken: "token-123",
      actorId: "crew-1",
      actorRole: "field_crew"
    };
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify(session));
    // No biometric hardware enrolled: authenticateWithAppLock allows straight through.
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValueOnce(false);
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ assignments: [] }), { status: 200 })) as unknown as typeof fetch;

    const { getByTestId } = await render(<RootNavigator />);

    await waitFor(() => expect(getByTestId("jobs-list-screen")).toBeTruthy());
  });

  it("deep-links straight to the assignment's incident when launched by tapping a notification", async () => {
    const session = {
      apiBaseUrl: "https://api.example.test",
      authToken: "token-123",
      actorId: "crew-1",
      actorRole: "field_crew"
    };
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify(session));
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValueOnce(false);
    jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValueOnce({
      notification: { request: { content: { data: { screen: "IncidentDetail", incident_id: "INC-000001", assignment_id: "ASN-000001" } } } }
    } as never);

    const assignedJob = {
      assignment_id: "ASN-000001",
      status: "Assigned",
      vehicle_status: "Assigned",
      vehicle_id: "AMB-901",
      crew_ids: ["crew-1"],
      updated_at: "2026-09-08T00:00:00.000Z",
      incident: { incident_id: "INC-000001", priority: "high", status: "Assigned", location_summary: "Main St", created_at: "2026-09-08T00:00:00.000Z" }
    };
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith("/api/assignments/mine")) return new Response(JSON.stringify({ assignments: [assignedJob] }), { status: 200 });
      if (url.includes("/patient-cases")) return new Response(JSON.stringify({ patient_cases: [] }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId } = await render(<RootNavigator />);

    await waitFor(() => expect(getByTestId("incident-detail-screen")).toBeTruthy());
  });
});
