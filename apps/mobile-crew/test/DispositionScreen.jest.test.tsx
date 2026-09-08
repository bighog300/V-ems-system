import { NavigationContainer } from "@react-navigation/native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";
import * as Location from "expo-location";

import DispositionScreen from "../src/screens/DispositionScreen.tsx";
import type { Session } from "../src/auth/session.ts";

const session: Session = {
  apiBaseUrl: "https://api.example.test",
  authToken: "token-123",
  actorId: "crew-1",
  actorRole: "field_crew"
};

function renderScreen() {
  return render(
    <NavigationContainer>
      <DispositionScreen patientCaseId="case-1" session={session} onBack={jest.fn()} />
    </NavigationContainer>
  );
}

describe("DispositionScreen — location context", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("attaches captured coordinates to the disposition save when location permission is granted", async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce({ coords: { latitude: 40.7128, longitude: -74.006, accuracy: 8 } } as never);

    let capturedBody: unknown;
    global.fetch = jest.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        capturedBody = JSON.parse(options.body as string);
        return new Response(JSON.stringify({ disposition_id: "DISP-1", updated_at: "2026-09-08T00:00:00.000Z" }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("location-permission-granted")).toBeTruthy());

    await fireEvent.press(getByTestId("outcome-treated_not_transported"));
    await fireEvent.press(getByTestId("save-disposition"));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody).toMatchObject({ location_lat: 40.7128, location_lng: -74.006, location_accuracy_m: 8 });
  });

  it("shows the permission rationale and never blocks saving when location was never granted", async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ status: "undetermined" } as never);

    let capturedBody: unknown;
    global.fetch = jest.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        capturedBody = JSON.parse(options.body as string);
        return new Response(JSON.stringify({ disposition_id: "DISP-2", updated_at: "2026-09-08T00:00:00.000Z" }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("location-permission-notice")).toBeTruthy());

    await fireEvent.press(getByTestId("outcome-treated_not_transported"));
    await fireEvent.press(getByTestId("save-disposition"));

    await waitFor(() => expect(getByTestId("disposition-saved")).toBeTruthy());
    expect(capturedBody).toEqual({ outcome: "treated_not_transported" });
  });
});
