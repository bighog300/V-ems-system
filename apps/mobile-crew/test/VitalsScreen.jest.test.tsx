import { NavigationContainer } from "@react-navigation/native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";

import VitalsScreen from "../src/screens/VitalsScreen.tsx";
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
});
