// Synthetic development workflow seed: vehicle, incident, assignment, OpenEMR patient, patient case,
// verified link, encounter, primary-survey assessment and vitals (the "C2" clinical chain).
// Runs on the Windows host against the development API using the supported development sign-in.
// Idempotent: every write carries a fixed Idempotency-Key and fixed synthetic values, and dispatch
// status changes are only applied when the record is not already past them.
const base = process.env.VEMS_API_URL ?? "http://127.0.0.1:3001";
const STARTED = "2026-01-01T08:00:00.000Z";

async function request(method, path, body, key, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers["idempotency-key"] = key;
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${path} failed: HTTP ${response.status} ${data?.error?.code ?? ""}`);
  return data;
}

const session = await request("POST", "/api/development/test-session", {});
const call = (method, path, body, key) => request(method, path, body, key, session.token);
const step = (label) => console.log(`ok: ${label}`);

await call("POST", "/api/vehicles", { vehicle_id: "AMB-001", callsign: "Dev Alpha 1", vehicle_type: "ALS Ambulance", home_station: "Development Station", operational_status: "Available", service_status: "Serviceable" }, "dev-seed-veh-001");
step("vehicle AMB-001");
const incident = await call("POST", "/api/incidents", { call: { call_source: "phone", received_at: STARTED }, incident: { category: "medical_emergency", priority: "high", description: "Synthetic development incident for mobile app testing", address: "1 Synthetic Test Street, Devtown", patient_count: 1 } }, "dev-seed-inc-001");
step(`incident ${incident.incident_id}`);
const assignment = await call("POST", `/api/incidents/${incident.incident_id}/assignments`, { vehicle_id: "AMB-001", crew_ids: ["STAFF-001"], reason: "Synthetic development dispatch" }, "dev-seed-asn-001");
if (assignment.status === "Proposed") await call("PATCH", `/api/assignments/${assignment.assignment_id}`, { action: "confirm_assignment" });
const current = await call("GET", `/api/incidents/${incident.incident_id}`);
if (current.status === "New") await call("PATCH", `/api/incidents/${incident.incident_id}`, { action: "queue_for_dispatch" });
if ((await call("GET", `/api/incidents/${incident.incident_id}`)).status === "Awaiting Dispatch") await call("PATCH", `/api/incidents/${incident.incident_id}`, { action: "assign_resource" });
step(`assignment ${assignment.assignment_id}`);

const patientCase = await call("POST", `/api/incidents/${incident.incident_id}/patient-cases`, { assignment_id: assignment.assignment_id, lead_clinician_id: "STAFF-001" }, "dev-seed-pc-001");
const patient = await call("POST", "/api/patients", { first_name: "Devtest", last_name: "Syntheticpatient", dob: "1980-01-01", sex: "male" }, "dev-seed-patient-001");
await call("POST", `/api/patient-cases/${patientCase.patient_case_id}/patient-link`, { verification_status: "verified", openemr_patient_id: patient.patient_id }, "dev-seed-link-001");
step(`patient case ${patientCase.patient_case_id} linked to a synthetic OpenEMR patient`);
await call("POST", `/api/patient-cases/${patientCase.patient_case_id}/encounters`, { care_started_at: STARTED, presenting_complaint: "Synthetic development assessment" }, "dev-seed-enc-001");
await call("POST", `/api/patient-cases/${patientCase.patient_case_id}/assessments`, { section_type: "primary_survey", performed_at: STARTED, payload: { notes: "Synthetic primary survey: airway clear, breathing normal, circulation adequate." } }, "dev-seed-asm-001");
await call("POST", `/api/patient-cases/${patientCase.patient_case_id}/observations`, { recorded_at: STARTED, vital_signs: { heart_rate_bpm: 80, blood_pressure_systolic: 120, blood_pressure_diastolic: 80, respiratory_rate_bpm: 16, spo2_pct: 98, temperature_c: 37.0, gcs_total: 15 }, notes: "Synthetic development vitals" }, "dev-seed-obs-001");
step("encounter, primary survey and vitals");
console.log("Synthetic development workflow ready; no real patient data was created.");
