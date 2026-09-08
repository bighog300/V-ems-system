import { NavigationContainer } from "@react-navigation/native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";

import InterventionsScreen from "../src/screens/InterventionsScreen.tsx";
import type { Session } from "../src/auth/session.ts";
import type { ClinicalProcedure, MedicationAdministration } from "../src/api/interventions.ts";

const session: Session = {
  apiBaseUrl: "https://api.example.test",
  authToken: "token-123",
  actorId: "crew-1",
  actorRole: "field_crew"
};

const medication: MedicationAdministration = {
  medication_administration_id: "MED-1",
  patient_case_id: "case-1",
  encounter_id: "ENC-1",
  medication_name: "Aspirin",
  formulation: null,
  dose: "300",
  dose_unit: "mg",
  route: "oral",
  indication: null,
  performed_at: "2026-09-08T10:00:00.000Z",
  clinician_id: null,
  response: null,
  adverse_reaction: null,
  downstream_status: "created",
  created_at: "2026-09-08T10:00:00.000Z"
};

const procedure: ClinicalProcedure = {
  procedure_id: "PROC-1",
  patient_case_id: "case-1",
  encounter_id: "ENC-1",
  procedure_type: "airway",
  procedure_name: "Oropharyngeal airway",
  performed_at: "2026-09-08T10:00:00.000Z",
  clinician_id: null,
  attempts: 1,
  success: true,
  complications: null,
  response: null,
  downstream_status: "created",
  created_at: "2026-09-08T10:00:00.000Z"
};

function renderScreen() {
  return render(
    <NavigationContainer>
      <InterventionsScreen patientCaseId="case-1" session={session} onBack={jest.fn()} />
    </NavigationContainer>
  );
}

describe("InterventionsScreen — repeat medication/procedure", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("repeat medication pre-fills the medication form from that history row", async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes("/medications")) return new Response(JSON.stringify({ medications: [medication] }), { status: 200 });
      return new Response(JSON.stringify({ procedures: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("repeat-medication-MED-1")).toBeTruthy());

    await fireEvent.press(getByTestId("repeat-medication-MED-1"));

    expect(getByTestId("med-name").props.value).toBe("Aspirin");
    expect(getByTestId("med-dose").props.value).toBe("300");
    expect(getByTestId("med-dose-unit").props.value).toBe("mg");
    expect(getByTestId("med-route").props.value).toBe("oral");
  });

  it("repeat procedure pre-fills the procedure form from that history row", async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url.includes("/procedures")) return new Response(JSON.stringify({ procedures: [procedure] }), { status: 200 });
      return new Response(JSON.stringify({ medications: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId("tab-procedures"));
    await waitFor(() => expect(getByTestId("repeat-procedure-PROC-1")).toBeTruthy());

    await fireEvent.press(getByTestId("repeat-procedure-PROC-1"));

    expect(getByTestId("proc-type").props.value).toBe("airway");
    expect(getByTestId("proc-name").props.value).toBe("Oropharyngeal airway");
    expect(getByTestId("proc-success").props.value).toBe(true);
  });
});
