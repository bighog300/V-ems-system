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
    jest.clearAllMocks();
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

  it("clears an invalid restored session before showing the sanitized login state", async () => {
    const session = {
      apiBaseUrl: "https://api.example.test",
      authToken: "stale-token",
      actorId: "crew-1",
      actorRole: "field_crew"
    };
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify(session));
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValueOnce(undefined);
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ error: { message: "JWT signature validation failed", code: "UNAUTHENTICATED" } }), { status: 401 })) as unknown as typeof fetch;

    const { getByTestId, queryByText } = await render(<RootNavigator />);

    await waitFor(() => expect(getByTestId("login-screen")).toBeTruthy());
    expect(getByTestId("session-invalid")).toBeTruthy();
    expect(getByTestId("session-invalid").props.children).toBe("Your session is no longer valid. Please sign in again.");
    expect(queryByText(/JWT|signature validation|cryptographic/i)).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("vems.mobile.session");
  });

  it("tells the crew member their access was revoked when the session is revoked at start-up", async () => {
    const session = { apiBaseUrl: "https://api.example.test", authToken: "t", actorId: "crew-1", actorRole: "field_crew" };
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify(session));
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValueOnce(undefined);
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ error: { message: "This session or device has been revoked", code: "SESSION_REVOKED" } }), { status: 401 })) as unknown as typeof fetch;

    const { getByTestId } = await render(<RootNavigator />);

    await waitFor(() => expect(getByTestId("login-screen")).toBeTruthy());
    expect(getByTestId("session-revoked").props.children).toBe("Your access to this device has been revoked. Contact your supervisor.");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("vems.mobile.session");
  });

  it("signs out with the revoked message when a request made while signed in learns the session was revoked", async () => {
    const session = { apiBaseUrl: "https://api.example.test", authToken: "t", actorId: "crew-1", actorRole: "field_crew" };
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify(session));
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValueOnce(false);
    // The session verifies at start-up; the first real request afterwards finds it revoked.
    global.fetch = jest.fn(async (url: unknown) => String(url).includes("/readiness")
      ? new Response("{}", { status: 200 })
      : new Response(JSON.stringify({ error: { message: "This session or device has been revoked", code: "SESSION_REVOKED" } }), { status: 401 })) as unknown as typeof fetch;

    const { getByTestId, queryByTestId, queryByText } = await render(<RootNavigator />);

    await waitFor(() => expect(getByTestId("login-screen")).toBeTruthy());
    expect(getByTestId("session-revoked")).toBeTruthy();
    expect(queryByTestId("jobs-list-screen")).toBeNull();
    expect(queryByText(/This session or device has been revoked/)).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("vems.mobile.session");
  });

  it("preserves a restored session when verification fails for connectivity or server reasons", async () => {
    const session = {
      apiBaseUrl: "https://api.example.test",
      authToken: "still-valid",
      actorId: "crew-1",
      actorRole: "field_crew"
    };
    jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(JSON.stringify(session));
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ error: { message: "temporary failure" } }), { status: 503 })) as unknown as typeof fetch;
    jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValueOnce(false);

    const { getByTestId } = await render(<RootNavigator />);

    await waitFor(() => expect(getByTestId("jobs-list-screen")).toBeTruthy());
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
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
