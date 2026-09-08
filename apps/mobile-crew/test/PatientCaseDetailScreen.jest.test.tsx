import { NavigationContainer } from "@react-navigation/native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as ExpoSQLite from "expo-sqlite";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

import PatientCaseDetailScreen from "../src/screens/PatientCaseDetailScreen.tsx";
import { __resetOfflineDatabaseCacheForTests } from "../src/offline/db.ts";
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
