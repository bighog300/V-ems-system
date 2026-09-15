// Stage 13 milestone 13a: the one reference profile seeded as the
// framework's default -- shaped after NEMSIS v3's minimum dataset
// categories, but a small representative subset, not the real spec (see
// docs/STAGE13_COMPLIANCE_REPORTING_PLAN.md's "Jurisdiction" and
// "Terminology" design decisions). A real deployment swaps this for its
// actual jurisdiction's profile; this one exists to prove the framework
// and give the exit gate's synthetic cases something real to validate
// against.
//
// requiredFields' paths match the snapshot shape epcr-finalization.mjs's
// snapshot() already produces (patient_case, incident, demographics,
// assessments, medications, procedures, disposition, ...), so wiring this
// into finalization in 13c is a call-site change, not a profile redesign.

function isTransportedOrTransferred(record) {
  const outcome = record?.disposition?.outcome;
  return outcome === "transported" || outcome === "transfer_other_provider";
}

function isIdentified(record) {
  return !record?.demographics?.unidentified;
}

export const referenceNemsisProfile = {
  id: "reference-nemsis-v3",
  name: "Reference NEMSIS-shaped minimum dataset",
  version: "1.0.0",
  requiredFields: [
    { id: "patient_first_name", path: "demographics.first_name", label: "Patient first name", appliesWhen: isIdentified },
    { id: "patient_last_name", path: "demographics.last_name", label: "Patient last name", appliesWhen: isIdentified },
    { id: "patient_dob_or_estimated_age", path: "demographics.dob", label: "Patient date of birth" },
    { id: "patient_sex", path: "demographics.sex", label: "Patient sex" },
    { id: "incident_complaint", path: "incident.category", label: "Incident/complaint category" },
    { id: "incident_location", path: "incident.address", label: "Incident/scene location" },
    { id: "primary_assessment", path: "assessments.0.section_type", label: "At least one primary assessment" },
    { id: "disposition_outcome", path: "disposition.outcome", label: "Disposition/outcome" },
    { id: "transport_destination", path: "disposition.destination_facility", label: "Transport destination facility", appliesWhen: isTransportedOrTransferred }
  ],
  // Small, representative code lists per category -- real deployments
  // supply their actual jurisdiction's code sets here (see the framework's
  // "Terminology" design decision: this data is not owned by V-EMS).
  codeLists: {
    complaint: [
      { code: "9-01-001", label: "Chest pain / discomfort" },
      { code: "9-02-001", label: "Breathing problem", aliases: ["Shortness of breath", "Respiratory distress"] },
      { code: "9-03-001", label: "Traumatic injury", aliases: ["Trauma"] },
      { code: "9-04-001", label: "Altered mental status" },
      { code: "9-05-001", label: "Psychiatric / behavioral" }
    ],
    impression: [
      { code: "I-01", label: "Acute coronary syndrome" },
      { code: "I-02", label: "Respiratory distress/failure" },
      { code: "I-03", label: "Traumatic injury, unspecified" },
      { code: "I-04", label: "Altered mental status, unspecified" },
      { code: "I-05", label: "No acute finding" }
    ],
    medication: [
      { code: "M-EPI", label: "Epinephrine" },
      { code: "M-ASA", label: "Aspirin" },
      { code: "M-NTG", label: "Nitroglycerin" },
      { code: "M-NAL", label: "Naloxone", aliases: ["Narcan"] },
      { code: "M-O2", label: "Oxygen" }
    ],
    procedure: [
      { code: "P-IV", label: "IV access", aliases: ["Intravenous cannulation"] },
      { code: "P-ECG12", label: "12-lead ECG" },
      { code: "P-SPLINT", label: "Splinting" },
      { code: "P-AIRWAY", label: "Airway management" },
      { code: "P-CPR", label: "CPR" }
    ],
    disposition: [
      { code: "D-TRANSPORT", label: "Transported to destination" },
      { code: "D-REFUSAL", label: "Patient refusal" },
      { code: "D-TREATED_NOT_TRANSPORTED", label: "Treated, not transported" },
      { code: "D-CANCELLED", label: "Cancelled prior to contact" },
      { code: "D-DOA", label: "Death on scene" }
    ],
    outcome: [
      { code: "O-TRANSPORTED", label: "transported" },
      { code: "O-TREATED_NOT_TRANSPORTED", label: "treated_not_transported" },
      { code: "O-REFUSAL_ASSESSMENT", label: "refusal_assessment" },
      { code: "O-REFUSAL_TREATMENT", label: "refusal_treatment" },
      { code: "O-REFUSAL_TRANSPORT", label: "refusal_transport" },
      { code: "O-NO_PATIENT_FOUND", label: "no_patient_found" },
      { code: "O-LEFT_SCENE", label: "left_scene" },
      { code: "O-TRANSFER_OTHER_PROVIDER", label: "transfer_other_provider" },
      { code: "O-CANCELLED_BEFORE_CONTACT", label: "cancelled_before_contact" },
      { code: "O-DEATH_ON_SCENE", label: "death_on_scene" },
      { code: "O-RESUSCITATION_TERMINATED", label: "resuscitation_terminated" }
    ]
  }
};
