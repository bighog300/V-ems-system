import assert from "node:assert/strict";
import { test } from "node:test";

import { createPatientCaseNote, listPatientCaseNotes } from "../src/api/patientCaseNotes.ts";

const SAMPLE_NOTE = {
  note_id: "NOTE-000001",
  patient_case_id: "PCR-000001",
  encounter_id: null,
  tags: ["scene_safety"],
  note_text: "Unstable structure near the patient.",
  authored_at: "2026-09-16T10:00:00.000Z",
  clinician_id: "STAFF-001",
  created_at: "2026-09-16T10:00:00.000Z"
};

test("listPatientCaseNotes returns the notes array", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ notes: [SAMPLE_NOTE] }), { status: 200 });
  const notes = await listPatientCaseNotes({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.equal(notes.length, 1);
  assert.deepEqual(notes[0].tags, ["scene_safety"]);
});

test("createPatientCaseNote posts tags and text", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const fetchImpl = async (url: string, options: any) => {
    capturedUrl = url;
    capturedBody = JSON.parse(options.body);
    return new Response(JSON.stringify(SAMPLE_NOTE), { status: 201 });
  };

  const created = await createPatientCaseNote({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    tags: ["scene_safety"],
    text: "Unstable structure near the patient.",
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(capturedUrl, "https://api.example.test/api/patient-cases/PCR-000001/notes");
  assert.deepEqual(capturedBody, { tags: ["scene_safety"], text: "Unstable structure near the patient." });
  assert.equal(created.note_id, "NOTE-000001");
});
