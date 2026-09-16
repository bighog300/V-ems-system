import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";

import PatientIdentityScreen from "../src/screens/PatientIdentityScreen.tsx";
import type { PatientCase } from "../src/api/patientCases.ts";
import type { Session } from "../src/auth/session.ts";

const session: Session = {
  apiBaseUrl: "https://api.example.test",
  authToken: "token-123",
  actorId: "crew-1",
  actorRole: "field_crew"
};

const unlinkedCase: PatientCase = {
  patient_case_id: "PCR-000001",
  incident_id: "INC-000001",
  patient_sequence: 1,
  status: "Patient Identification Pending",
  temporary_label: null,
  assignment_id: null,
  vehicle_id: null,
  lead_clinician_id: null,
  verification_status: "unknown",
  openemr_patient_id: null,
  closure_ready: false,
  created_at: "2026-09-16T00:00:00.000Z",
  updated_at: "2026-09-16T00:00:00.000Z"
};

describe("PatientIdentityScreen search modes", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("defaults to name+DOB+address mode and searches with those fields plus address", async () => {
    let capturedBody: unknown;
    global.fetch = jest.fn(async (_url: string, options: any) => {
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ match_status: "no_match", match_confidence: 0, patient_id: null, candidates: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId } = await render(<PatientIdentityScreen patientCase={unlinkedCase} session={session} onBack={jest.fn()} onLinked={jest.fn()} />);

    expect(getByTestId("search-mode-name").props.accessibilityState.selected).toBe(true);

    await fireEvent.changeText(getByTestId("search-first-name"), "Ada");
    await fireEvent.changeText(getByTestId("search-last-name"), "Lovelace");
    await fireEvent.changeText(getByTestId("search-dob"), "1990-01-01");
    await fireEvent.changeText(getByTestId("search-address"), "1400 Riverside Dr");
    await fireEvent.press(getByTestId("search-submit"));

    await waitFor(() => expect(capturedBody).toBeTruthy());
    expect(capturedBody).toEqual({ first_name: "Ada", last_name: "Lovelace", dob: "1990-01-01", address: "1400 Riverside Dr" });
  });

  it("switches to identity-number mode and searches by identity_number alone", async () => {
    let capturedBody: unknown;
    global.fetch = jest.fn(async (_url: string, options: any) => {
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ match_status: "no_match", match_confidence: 0, patient_id: null, candidates: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId } = await render(<PatientIdentityScreen patientCase={unlinkedCase} session={session} onBack={jest.fn()} onLinked={jest.fn()} />);

    await fireEvent.press(getByTestId("search-mode-identity_number"));
    await fireEvent.changeText(getByTestId("search-identity-number"), "ID-4471829");
    await fireEvent.press(getByTestId("search-submit"));

    await waitFor(() => expect(capturedBody).toBeTruthy());
    expect(capturedBody).toEqual({ identity_number: "ID-4471829" });
  });

  it("switches to hospital-card mode and searches by hospital_card_number alone", async () => {
    let capturedBody: unknown;
    global.fetch = jest.fn(async (_url: string, options: any) => {
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ match_status: "no_match", match_confidence: 0, patient_id: null, candidates: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId } = await render(<PatientIdentityScreen patientCase={unlinkedCase} session={session} onBack={jest.fn()} onLinked={jest.fn()} />);

    await fireEvent.press(getByTestId("search-mode-hospital_card_number"));
    await fireEvent.changeText(getByTestId("search-hospital-card-number"), "HC-208831");
    await fireEvent.press(getByTestId("search-submit"));

    await waitFor(() => expect(capturedBody).toBeTruthy());
    expect(capturedBody).toEqual({ hospital_card_number: "HC-208831" });
  });

  it("disables Search until the active mode's required field is filled", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ match_status: "no_match", match_confidence: 0, patient_id: null, candidates: [] }), { status: 200 })) as unknown as typeof fetch;

    const { getByTestId } = await render(<PatientIdentityScreen patientCase={unlinkedCase} session={session} onBack={jest.fn()} onLinked={jest.fn()} />);

    await fireEvent.press(getByTestId("search-mode-identity_number"));
    expect(getByTestId("search-submit").props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(getByTestId("search-identity-number"), "ID-4471829");
    expect(getByTestId("search-submit").props.accessibilityState?.disabled).toBe(false);
  });

  it("scanning a barcode fills the identity-number field for that mode", async () => {
    const { getByTestId } = await render(<PatientIdentityScreen patientCase={unlinkedCase} session={session} onBack={jest.fn()} onLinked={jest.fn()} />);

    await fireEvent.press(getByTestId("search-mode-identity_number"));
    await fireEvent.press(getByTestId("scan-identity-number"));
    expect(getByTestId("barcode-camera-view")).toBeTruthy();

    await fireEvent.press(getByTestId("barcode-camera-view"));

    expect(getByTestId("search-identity-number").props.value).toBe("fake-scanned-code");
  });

  it("scanning a barcode fills the hospital-card field for that mode, independent of the identity-number field", async () => {
    const { getByTestId } = await render(<PatientIdentityScreen patientCase={unlinkedCase} session={session} onBack={jest.fn()} onLinked={jest.fn()} />);

    await fireEvent.press(getByTestId("search-mode-hospital_card_number"));
    await fireEvent.press(getByTestId("scan-hospital-card-number"));
    await fireEvent.press(getByTestId("barcode-camera-view"));

    expect(getByTestId("search-hospital-card-number").props.value).toBe("fake-scanned-code");
  });
});
