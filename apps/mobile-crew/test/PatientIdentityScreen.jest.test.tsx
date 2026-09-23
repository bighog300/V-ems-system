import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { ScrollView } from "react-native";
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

  it("reveals the create form from the actionable parent without creating a patient", async () => {
    let createCalls = 0;
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith("/api/patients/search")) {
        return new Response(JSON.stringify({ match_status: "no_match", match_confidence: 0, patient_id: null, candidates: [] }), { status: 200 });
      }
      createCalls += 1;
      return new Response(JSON.stringify({ patient_id: "unexpected" }), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId, queryByTestId } = await render(<PatientIdentityScreen patientCase={unlinkedCase} session={session} onBack={jest.fn()} onLinked={jest.fn()} />);
    await fireEvent.changeText(getByTestId("search-first-name"), "Stage");
    await fireEvent.changeText(getByTestId("search-last-name"), "Alpha");
    await fireEvent.changeText(getByTestId("search-dob"), "2000-01-02");
    await fireEvent.press(getByTestId("search-submit"));
    await waitFor(() => expect(getByTestId("patient-create-new-option")).toBeTruthy());

    const option = getByTestId("patient-create-new-option");
    expect(option.props.accessibilityRole).toBe("button");
    expect(option.props.accessibilityState.disabled).toBe(false);
    expect(queryByTestId("patient-create-form")).toBeNull();
    await fireEvent.press(option);

    expect(getByTestId("patient-create-form")).toBeTruthy();
    expect(createCalls).toBe(0);
    await fireEvent.changeText(getByTestId("create-sex"), "X");
    expect(getByTestId("search-first-name").props.value).toBe("Stage");
    expect(getByTestId("search-last-name").props.value).toBe("Alpha");
    expect(getByTestId("search-dob").props.value).toBe("2000-01-02");
    expect(getByTestId("create-sex").props.value).toBe("X");
    expect(getByTestId("patient-create-and-link").props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(option);
    expect(getByTestId("patient-create-form")).toBeTruthy();
    expect(createCalls).toBe(0);
  });

  it("reveals the opened form once after layout without focusing or calling the API", async () => {
    const scrollToEnd = jest.spyOn(ScrollView.prototype as any, "scrollToEnd").mockImplementation(() => undefined);
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ match_status: "no_match", match_confidence: 0, patient_id: null, candidates: [] }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { getByTestId } = await render(<PatientIdentityScreen patientCase={unlinkedCase} session={session} onBack={jest.fn()} onLinked={jest.fn()} />);
    await fireEvent.changeText(getByTestId("search-first-name"), "Stage");
    await fireEvent.press(getByTestId("search-submit"));
    await waitFor(() => expect(getByTestId("patient-create-new-option")).toBeTruthy());
    await fireEvent.press(getByTestId("patient-create-new-option"));
    expect(scrollToEnd).toHaveBeenCalledTimes(0);
    await fireEvent(getByTestId("patient-create-form"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 100 } } });
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
    await fireEvent(getByTestId("patient-create-form"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 100 } } });
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
    expect(getByTestId("create-sex").props.value).toBe("");
    expect(getByTestId("create-sex").props.accessibilityLabel).toBe("Sex");
    expect(getByTestId("create-sex").props.accessibilityHint).toMatch(/X/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("enters pending synchronously and ignores a duplicate create-and-link press", async () => {
    let resolveCreate!: (response: Response) => void;
    const createResponse = new Promise<Response>((resolve) => { resolveCreate = resolve; });
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith("/api/patients/search")) return new Response(JSON.stringify({ match_status: "no_match", match_confidence: 0, patient_id: null, candidates: [] }), { status: 200 });
      if (url.endsWith("/api/patients")) return createResponse;
      return new Response(JSON.stringify({ patient_case_id: "PCR-000001" }), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId } = await render(<PatientIdentityScreen patientCase={unlinkedCase} session={session} onBack={jest.fn()} onLinked={jest.fn()} />);
    await fireEvent.changeText(getByTestId("search-first-name"), "Stage");
    await fireEvent.changeText(getByTestId("search-last-name"), "Alpha");
    await fireEvent.changeText(getByTestId("search-dob"), "2000-01-02");
    await fireEvent.press(getByTestId("search-submit"));
    await waitFor(() => expect(getByTestId("patient-create-new-option")).toBeTruthy());
    await fireEvent.press(getByTestId("patient-create-new-option"));
    await fireEvent.changeText(getByTestId("create-sex"), "X");
    const submit = getByTestId("patient-create-and-link");
    expect(submit.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(submit);
    await waitFor(() => expect(getByTestId("patient-create-submit-pending")).toBeTruthy());
    fireEvent.press(submit);
    expect(calls.filter((url) => url.endsWith("/api/patients")).length).toBe(1);
    resolveCreate(new Response(JSON.stringify({ patient_id: "OE-NEW" }), { status: 201 }));
    await waitFor(() => expect(calls.filter((url) => url.endsWith("/patient-link")).length).toBe(1));
  });

  it("sanitizes a failed create and never retries it", async () => {
    let createCalls = 0;
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith("/api/patients/search")) return new Response(JSON.stringify({ match_status: "no_match", match_confidence: 0, patient_id: null, candidates: [] }), { status: 200 });
      createCalls += 1;
      return new Response(JSON.stringify({ error: { message: "secret downstream detail" } }), { status: 500 });
    }) as unknown as typeof fetch;
    const { getByTestId, queryByText } = await render(<PatientIdentityScreen patientCase={unlinkedCase} session={session} onBack={jest.fn()} onLinked={jest.fn()} />);
    await fireEvent.changeText(getByTestId("search-first-name"), "Stage");
    await fireEvent.changeText(getByTestId("search-last-name"), "Alpha");
    await fireEvent.changeText(getByTestId("search-dob"), "2000-01-02");
    await fireEvent.press(getByTestId("search-submit"));
    await waitFor(() => expect(getByTestId("patient-create-new-option")).toBeTruthy());
    await fireEvent.press(getByTestId("patient-create-new-option"));
    await fireEvent.changeText(getByTestId("create-sex"), "X");
    await fireEvent.press(getByTestId("patient-create-and-link"));
    await waitFor(() => expect(getByTestId("patient-create-submit-error")).toBeTruthy());
    expect(queryByText(/secret downstream detail/)).toBeNull();
    await fireEvent.press(getByTestId("patient-create-and-link"));
    expect(createCalls).toBe(1);
  });
});
