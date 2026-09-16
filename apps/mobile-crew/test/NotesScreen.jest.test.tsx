import { NavigationContainer } from "@react-navigation/native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { jest, describe, it, expect, afterEach } from "@jest/globals";

import NotesScreen from "../src/screens/NotesScreen.tsx";
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
      <NotesScreen patientCaseId="PCR-000001" session={session} onBack={jest.fn()} />
    </NavigationContainer>
  );
}

describe("NotesScreen", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("shows an empty state when nothing has been recorded yet", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ notes: [] }), { status: 200 })) as unknown as typeof fetch;

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("notes-empty")).toBeTruthy());
  });

  it("keeps Record note disabled until at least one tag and non-empty text are set", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ notes: [] }), { status: 200 })) as unknown as typeof fetch;

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("notes-empty")).toBeTruthy());

    expect(getByTestId("record-note").props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(getByTestId("tag-scene_safety"));
    expect(getByTestId("record-note").props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(getByTestId("note-text"), "Unstable structure near the patient.");
    expect(getByTestId("record-note").props.accessibilityState?.disabled).toBe(false);
  });

  it("toggling a tag twice deselects it", async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ notes: [] }), { status: 200 })) as unknown as typeof fetch;

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("notes-empty")).toBeTruthy());

    await fireEvent.press(getByTestId("tag-scene_safety"));
    expect(getByTestId("tag-scene_safety").props.accessibilityState.selected).toBe(true);

    await fireEvent.press(getByTestId("tag-scene_safety"));
    expect(getByTestId("tag-scene_safety").props.accessibilityState.selected).toBe(false);
  });

  it("records a note with multiple tags and shows it in the history list", async () => {
    let capturedBody: { tags: string[]; text: string } | undefined;
    global.fetch = jest.fn(async (url: string, options: any = {}) => {
      if (options.method === "POST") {
        const body = JSON.parse(options.body);
        capturedBody = body;
        return new Response(
          JSON.stringify({
            note_id: "NOTE-000001",
            patient_case_id: "PCR-000001",
            encounter_id: null,
            tags: body.tags,
            note_text: body.text,
            authored_at: "2026-09-16T10:00:00.000Z",
            clinician_id: "STAFF-001",
            created_at: "2026-09-16T10:00:00.000Z"
          }),
          { status: 201 }
        );
      }
      return new Response(JSON.stringify({ notes: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId("notes-empty")).toBeTruthy());

    await fireEvent.press(getByTestId("tag-scene_safety"));
    await fireEvent.press(getByTestId("tag-mechanism_of_injury"));
    await fireEvent.changeText(getByTestId("note-text"), "Downed power line near the vehicle.");
    await fireEvent.press(getByTestId("record-note"));

    await waitFor(() => expect(getByTestId("note-NOTE-000001")).toBeTruthy());
    expect(capturedBody).toEqual({ tags: ["scene_safety", "mechanism_of_injury"], text: "Downed power line near the vehicle." });
  });
});
