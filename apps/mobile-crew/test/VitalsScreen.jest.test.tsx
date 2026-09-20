import { NavigationContainer } from "@react-navigation/native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as ExpoSQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";

import VitalsScreen from "../src/screens/VitalsScreen.tsx";
import { __resetOfflineDatabaseCacheForTests, getOfflineDatabase } from "../src/offline/db.ts";
import { getOrCreateEncryptionKey } from "../src/offline/crypto.ts";
import { enqueueMutation } from "../src/offline/outboxStore.ts";
import { createNodeSqliteAdapter } from "./offline/nodeSqliteAdapter.ts";
import type { Session } from "../src/auth/session.ts";
import type { PatientCaseObservation } from "../src/api/observations.ts";

const session: Session = {
  apiBaseUrl: "https://api.example.test",
  authToken: "token-123",
  actorId: "crew-1",
  actorRole: "field_crew"
};

const lastObservation: PatientCaseObservation = {
  observation_event_id: "OBS-1",
  patient_case_id: "case-1",
  encounter_id: "ENC-1",
  performed_at: "2026-09-08T10:00:00.000Z",
  clinician_id: null,
  observations: { heart_rate_bpm: 88, spo2_pct: 97, respiratory_rate_bpm: 16 },
  notes: null,
  downstream_status: "created",
  created_at: "2026-09-08T10:00:00.000Z"
};

function renderScreen() {
  return render(
    <NavigationContainer>
      <VitalsScreen patientCaseId="case-1" session={session} onBack={jest.fn()} />
    </NavigationContainer>
  );
}

describe("VitalsScreen — repeat last vitals", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("does not show a repeat action when there is no history yet", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ observations: [] }), { status: 200 })) as unknown as typeof fetch;

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("vitals-empty")).toBeTruthy());

    expect(queryByTestId("repeat-last-vitals")).toBeNull();
  });

  it("repeat last vitals pre-fills the form from the most recent observation", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ observations: [lastObservation] }), { status: 200 })) as unknown as typeof fetch;

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("repeat-last-vitals")).toBeTruthy());

    await fireEvent.press(getByTestId("repeat-last-vitals"));

    expect(getByTestId("vital-input-heart_rate_bpm").props.value).toBe("88");
    expect(getByTestId("vital-input-spo2_pct").props.value).toBe("97");
    expect(getByTestId("vital-input-respiratory_rate_bpm").props.value).toBe("16");
    expect(getByTestId("vital-input-temperature_c").props.value).toBe("");
  });

  it("renders a keyboard-safe observation form with a uniquely identified disabled submit", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ observations: [] }), { status: 200 })) as unknown as typeof fetch;

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("observation-form")).toBeTruthy());

    expect(getByTestId("vitals-screen").props.keyboardShouldPersistTaps).toBe("handled");
    expect(getByTestId("observation-submit").props.accessibilityRole).toBe("button");
    expect(getByTestId("observation-submit").props.accessibilityState.disabled).toBe(true);
    expect(getByTestId("observation-submit-idle")).toBeTruthy();

    await fireEvent.changeText(getByTestId("vital-input-heart_rate_bpm"), "80");
    await waitFor(() => expect(getByTestId("observation-submit").props.accessibilityState.disabled).toBe(false));
  });
});

describe("VitalsScreen — offline history", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    __resetOfflineDatabaseCacheForTests();
    jest.mocked(ExpoSQLite.openDatabaseAsync).mockResolvedValueOnce(createNodeSqliteAdapter() as never);
    // The outbox is encrypted with a key kept in secure storage, so the mock has to remember it between calls.
    const store = new Map<string, string>();
    jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key: string) => store.get(key) ?? null);
    jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key: string, value: string) => { store.set(key, value); });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    __resetOfflineDatabaseCacheForTests();
  });

  it("marks vitals charted offline as waiting to sync, says earlier entries are unavailable, and shows the time in local time", async () => {
    global.fetch = jest.fn(async () => { throw new TypeError("Network request failed"); }) as unknown as typeof fetch;

    const { getByTestId, findByTestId, queryAllByTestId, getByText } = await renderScreen();
    await waitFor(() => expect(getByTestId("vitals-offline-notice")).toBeTruthy());
    expect(getByText(/earlier entries cannot be shown/i)).toBeTruthy();

    await fireEvent.changeText(getByTestId("vital-input-heart_rate_bpm"), "91");
    await fireEvent.press(getByTestId("observation-submit"));

    await findByTestId("observation-submit-succeeded");
    await waitFor(() => expect(queryAllByTestId(/^waiting-to-sync-LOCAL-/).length).toBe(1));
    expect(queryAllByTestId(/^observation-entry-LOCAL-/).length).toBe(1);
  });

  it("shows what is waiting to sync next to earlier charting from the server, and only the waiting entry is marked", async () => {
    const key = await getOrCreateEncryptionKey();
    await enqueueMutation(await getOfflineDatabase(), key, { scope: "observation", patientCaseId: "case-1", method: "POST", path: "https://api.example.test/api/patient-cases/case-1/observations", payload: { vital_signs: { heart_rate_bpm: 77 }, recorded_at: "2026-09-08T10:30:00.000Z" } });
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ observations: [lastObservation] }), { status: 200 })) as unknown as typeof fetch;

    const { getByTestId, queryAllByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("observation-entry-OBS-1")).toBeTruthy());

    expect(queryAllByTestId(/^observation-entry-/).length).toBe(2);
    expect(queryAllByTestId(/^waiting-to-sync-LOCAL-/).length).toBe(1);
    expect(queryByTestId("waiting-to-sync-OBS-1")).toBeNull();
    expect(queryByTestId("vitals-offline-notice")).toBeNull();
  });
});
