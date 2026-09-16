import assert from "node:assert/strict";
import { test } from "node:test";

import {
  __resetPatientHistoryStoreForTests,
  getPatientHistory,
  isPatientHistoryPurged,
  purgePatientHistory,
  purgePatientHistoryForCases,
  setPatientHistory
} from "../src/history/patientHistoryStore.ts";
import type { PatientHistory } from "../src/api/patientHistory.ts";

const history: PatientHistory = {
  patient_case_id: "PCR-000001",
  openemr_patient_id: "OE-101",
  as_of: "2026-09-16T00:00:00.000Z",
  medications: [{ medication_name: "Metformin", dose: "500mg", frequency: "BID", status: "active" }],
  encounters: [{ encounter_date: "2026-08-01", reason: "Follow-up", facility: "Riverside Clinic" }]
};

test("setPatientHistory stores and getPatientHistory retrieves it", () => {
  __resetPatientHistoryStoreForTests();
  assert.equal(getPatientHistory("PCR-000001"), null);

  setPatientHistory("PCR-000001", history);

  assert.deepEqual(getPatientHistory("PCR-000001"), history);
  assert.equal(isPatientHistoryPurged("PCR-000001"), false);
});

test("purgePatientHistory removes the entry and marks it purged", () => {
  __resetPatientHistoryStoreForTests();
  setPatientHistory("PCR-000001", history);

  purgePatientHistory("PCR-000001");

  assert.equal(getPatientHistory("PCR-000001"), null);
  assert.equal(isPatientHistoryPurged("PCR-000001"), true);
});

test("a purged case never accepts history again, even if something tries to re-store it", () => {
  __resetPatientHistoryStoreForTests();
  purgePatientHistory("PCR-000001");

  setPatientHistory("PCR-000001", history);

  assert.equal(getPatientHistory("PCR-000001"), null);
});

test("purgePatientHistoryForCases purges every id given, leaving others untouched", () => {
  __resetPatientHistoryStoreForTests();
  setPatientHistory("PCR-000001", history);
  setPatientHistory("PCR-000002", { ...history, patient_case_id: "PCR-000002" });

  purgePatientHistoryForCases(["PCR-000001"]);

  assert.equal(getPatientHistory("PCR-000001"), null);
  assert.equal(isPatientHistoryPurged("PCR-000001"), true);
  assert.notEqual(getPatientHistory("PCR-000002"), null);
  assert.equal(isPatientHistoryPurged("PCR-000002"), false);
});
