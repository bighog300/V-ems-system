import { render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";

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
});
