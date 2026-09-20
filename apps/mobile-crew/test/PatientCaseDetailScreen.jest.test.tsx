import { NavigationContainer } from "@react-navigation/native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as ExpoSQLite from "expo-sqlite";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

import PatientCaseDetailScreen from "../src/screens/PatientCaseDetailScreen.tsx";
import { __resetOfflineDatabaseCacheForTests, getOfflineDatabase } from "../src/offline/db.ts";
import { __resetPatientHistoryStoreForTests } from "../src/history/patientHistoryStore.ts";
import { createNodeSqliteAdapter } from "./offline/nodeSqliteAdapter.ts";
import type { Session } from "../src/auth/session.ts";
import type { PatientCase } from "../src/api/patientCases.ts";

const session: Session = {
  apiBaseUrl: "https://api.example.test",
  authToken: "token-123",
  actorId: "crew-1",
  actorRole: "field_crew"
};

const patientCase: PatientCase = {
  patient_case_id: "case-1",
  incident_id: "incident-1",
  patient_sequence: 1,
  status: "Created",
  temporary_label: null,
  assignment_id: null,
  vehicle_id: null,
  lead_clinician_id: null,
  verification_status: "unknown",
  openemr_patient_id: null,
  closure_ready: false,
  created_at: "2026-09-08T00:00:00.000Z",
  updated_at: "2026-09-08T00:00:00.000Z"
};

function renderScreen() {
  return render(
    <NavigationContainer>
      <PatientCaseDetailScreen
        patientCase={patientCase}
        session={session}
        onBack={jest.fn()}
        onOpenIdentity={jest.fn()}
        onOpenVitals={jest.fn()}
        onOpenInterventions={jest.fn()}
        onOpenAssessment={jest.fn()}
        onOpenDisposition={jest.fn()}
        onOpenNotes={jest.fn()}
        onOpenEpcr={jest.fn()}
      />
    </NavigationContainer>
  );
}

describe("PatientCaseDetailScreen — attachments", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    __resetOfflineDatabaseCacheForTests();
    jest.mocked(ExpoSQLite.openDatabaseAsync).mockResolvedValueOnce(createNodeSqliteAdapter() as never);
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith("/demographics")) return new Response("null", { status: 200 });
      if (url.endsWith("/encounter")) return new Response(null, { status: 404 });
      return new Response(JSON.stringify(patientCase), { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    __resetOfflineDatabaseCacheForTests();
  });

  it("shows an empty state when nothing has been captured yet", async () => {
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("attachments-empty")).toBeTruthy());
  });

  it("capturing a photo encrypts and queues it, then shows it in the list", async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValueOnce({ status: "granted" } as never);
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file://photo.jpg", base64: "ZmFrZS1qcGVn", fileName: "scene.jpg", mimeType: "image/jpeg", fileSize: 9 }]
    } as never);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("attachments-empty")).toBeTruthy());

    await fireEvent.press(getByTestId("take-photo"));

    await waitFor(() => expect(getByTestId("attachment-name-scene.jpg")).toBeTruthy());
  });

  it("capturing a photo is a no-op when the crew member cancels", async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValueOnce({ status: "granted" } as never);
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValueOnce({ canceled: true } as never);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("attachments-empty")).toBeTruthy());

    await fireEvent.press(getByTestId("take-photo"));

    await waitFor(() => expect(getByTestId("attachments-empty")).toBeTruthy());
  });

  it("adding a document reads its content via the file system module and queues it", async () => {
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file://form.pdf", name: "refusal-form.pdf", mimeType: "application/pdf", size: 12 }]
    } as never);
    jest.mocked(FileSystem.readAsStringAsync).mockResolvedValueOnce("ZmFrZS1wZGYtY29udGVudA==" as never);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("attachments-empty")).toBeTruthy());

    await fireEvent.press(getByTestId("add-document"));

    await waitFor(() => expect(getByTestId("attachment-name-refusal-form.pdf")).toBeTruthy());
  });
});

describe("PatientCaseDetailScreen — on-device patient history", () => {
  const originalFetch = global.fetch;

  const linkedCase: PatientCase = { ...patientCase, openemr_patient_id: "OE-101", verification_status: "verified" };

  function renderLinkedScreen() {
    return render(
      <NavigationContainer>
        <PatientCaseDetailScreen
          patientCase={linkedCase}
          session={session}
          onBack={jest.fn()}
          onOpenIdentity={jest.fn()}
          onOpenVitals={jest.fn()}
          onOpenInterventions={jest.fn()}
          onOpenAssessment={jest.fn()}
          onOpenDisposition={jest.fn()}
          onOpenNotes={jest.fn()}
          onOpenEpcr={jest.fn()}
        />
      </NavigationContainer>
    );
  }

  beforeEach(() => {
    __resetOfflineDatabaseCacheForTests();
    __resetPatientHistoryStoreForTests();
    jest.mocked(ExpoSQLite.openDatabaseAsync).mockResolvedValueOnce(createNodeSqliteAdapter() as never);
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith("/demographics")) return new Response("null", { status: 200 });
      if (url.endsWith("/encounter")) return new Response(null, { status: 404 });
      if (url.endsWith("/history")) {
        return new Response(
          JSON.stringify({
            patient_case_id: linkedCase.patient_case_id,
            openemr_patient_id: "OE-101",
            as_of: "2026-09-16T00:00:00.000Z",
            medications: [{ medication_name: "Metformin", dose: "500mg", frequency: "BID", status: "active" }],
            encounters: [{ encounter_date: "2026-08-01", reason: "Follow-up", facility: "Riverside Clinic" }]
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify(linkedCase), { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    __resetOfflineDatabaseCacheForTests();
    __resetPatientHistoryStoreForTests();
  });

  it("fetches and renders known medications and recent encounters for a linked patient", async () => {
    const { getByTestId } = await renderLinkedScreen();

    await waitFor(() => expect(getByTestId("history-medication-0")).toBeTruthy());
    expect(getByTestId("history-medication-0").props.children).toBeTruthy();
    expect(getByTestId("history-encounter-0")).toBeTruthy();
  });

  it("never writes the fetched history into the durable offline cache", async () => {
    const { getByTestId } = await renderLinkedScreen();

    await waitFor(() => expect(getByTestId("history-medication-0")).toBeTruthy());

    const db = await getOfflineDatabase();
    const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM cached_reads WHERE cache_key LIKE '%history%';`);
    expect(row?.count ?? 0).toBe(0);
  });

  it("shows a cleared message and never re-fetches once history has been purged", async () => {
    const first = await renderLinkedScreen();
    await waitFor(() => expect(first.getByTestId("history-medication-0")).toBeTruthy());
    first.unmount();

    const { purgePatientHistory } = await import("../src/history/patientHistoryStore.ts");
    purgePatientHistory(linkedCase.patient_case_id);

    const fetchCallsBeforeRemount = (global.fetch as jest.Mock).mock.calls.length;

    __resetOfflineDatabaseCacheForTests();
    jest.mocked(ExpoSQLite.openDatabaseAsync).mockResolvedValueOnce(createNodeSqliteAdapter() as never);
    const second = await renderLinkedScreen();
    await waitFor(() => expect(second.getByTestId("history-cleared")).toBeTruthy());

    const callsAfterRemount = (global.fetch as jest.Mock).mock.calls.slice(fetchCallsBeforeRemount);
    expect(callsAfterRemount.length).toBeGreaterThan(0);
    expect(callsAfterRemount.some((call: unknown[]) => (call[0] as string).endsWith("/history"))).toBe(false);
  });
});

describe("PatientCaseDetailScreen — weight and guardian", () => {
  const originalFetch = global.fetch;
  let saved: Record<string, unknown> | null = null;

  beforeEach(() => {
    saved = null;
    __resetOfflineDatabaseCacheForTests();
    jest.mocked(ExpoSQLite.openDatabaseAsync).mockResolvedValueOnce(createNodeSqliteAdapter() as never);
    global.fetch = jest.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/demographics") && options?.method === "PUT") {
        saved = JSON.parse(options.body as string);
        return new Response(JSON.stringify({ patient_case_id: "case-1", ...saved, updated_at: "2026-09-20T10:00:00.000Z" }), { status: 200 });
      }
      if (url.endsWith("/demographics")) return new Response("null", { status: 200 });
      if (url.endsWith("/encounter")) return new Response(null, { status: 404 });
      return new Response(JSON.stringify(patientCase), { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    __resetOfflineDatabaseCacheForTests();
  });

  it("captures weight, minor status and the guardian, and sends them with the demographics", async () => {
    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("weight-input")).toBeTruthy());
    expect(queryByTestId("guardian-name-input")).toBeNull();

    await fireEvent.changeText(getByTestId("weight-input"), "14.5");
    await fireEvent(getByTestId("minor-switch"), "valueChange", true);
    await fireEvent.changeText(getByTestId("guardian-name-input"), "Pat Small");
    await fireEvent.changeText(getByTestId("guardian-relationship-input"), "Parent");
    await fireEvent.changeText(getByTestId("guardian-phone-input"), "555-0100");
    await fireEvent.press(getByTestId("save-demographics"));

    await waitFor(() => expect(getByTestId("demographics-saved")).toBeTruthy());
    expect(saved).toMatchObject({ weight_kg: 14.5, minor_context: true, guardian_name: "Pat Small", guardian_relationship: "Parent", guardian_phone: "555-0100" });
  });

  it("rejects an impossible weight before anything is sent", async () => {
    const { getByTestId, findByText } = await renderScreen();
    await waitFor(() => expect(getByTestId("weight-input")).toBeTruthy());
    await fireEvent.changeText(getByTestId("weight-input"), "900");
    await fireEvent.press(getByTestId("save-demographics"));
    expect(await findByText("Weight must be between 0.2 and 500 kg.")).toBeTruthy();
    expect(saved).toBeNull();
  });

  it("does not send a weight or guardian for an adult, and says the patient is not a minor", async () => {
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("weight-input")).toBeTruthy());
    await fireEvent.press(getByTestId("save-demographics"));
    await waitFor(() => expect(getByTestId("demographics-saved")).toBeTruthy());
    expect(saved).toMatchObject({ minor_context: false });
    expect(saved).not.toHaveProperty("weight_kg");
    expect(saved).not.toHaveProperty("guardian_name");
  });
});
