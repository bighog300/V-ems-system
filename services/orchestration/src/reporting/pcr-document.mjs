// Stage 13 milestone 13d: renders a signed, versioned ePCR export document
// (PDF) from an epcr_versions snapshot and its epcr_signatures. Pure-JS
// (pdfkit), no headless-browser/native dependency, per
// docs/STAGE13_COMPLIANCE_REPORTING_PLAN.md's "Document generation" design
// decision.
//
// Deterministic by construction: re-rendering the same version produces
// byte-identical output. That requires never touching the wall clock --
// every date printed, and PDFKit's own /Info CreationDate/ModDate (which
// its file-ID hash is derived from), comes from the version's own
// created_at, never `new Date()`. It also means using only PDFKit's
// standard 14 fonts (Helvetica/Helvetica-Bold) -- no embedded font file,
// so there's no font-subsetting step whose output could vary.

import PDFDocument from "pdfkit";

// Stage 13 milestone 13h: the export *document format* gets its own
// version number, independent of epcr_versions.version_number (which
// tracks the clinical record's own history -- amendments, corrections --
// not how this renderer lays a version out as a PDF). Bumping this is a
// deliberate, reviewed change to the rendering/layout logic itself;
// it lets a future consumer -- or a regression test -- tell which
// rendering contract a given PDF was produced under, and stays fixed
// across every schema change to the underlying content_json.
//
// Format 2 (Stage 14): the document now renders every clinical item the hashed
// version content holds -- vital signs, assessment findings, medication and
// procedure detail, the full disposition, the handover and crew notes. Format 1
// printed only an assessment's type and time and omitted vitals, the handover
// and notes entirely, so a signed record did not show what the signature covered.
export const EXPORT_FORMAT_VERSION = 2;

function collectPdfBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function heading(doc, text) {
  doc.moveDown(0.75).font("Helvetica-Bold").fontSize(13).text(text);
  doc.font("Helvetica").fontSize(10);
}

function field(doc, label, value) {
  doc.font("Helvetica-Bold").fontSize(9).text(label, { continued: true });
  doc.font("Helvetica").fontSize(9).text(` ${value ?? "—"}`);
}

// A labelled line that is skipped entirely when there is nothing to show, so optional
// clinical fields do not add "—" noise to every entry.
function optionalField(doc, label, value) {
  if (value === null || value === undefined || value === "") return;
  field(doc, label, typeof value === "object" ? JSON.stringify(value) : value);
}

function formatOrDash(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function humanize(key) {
  const text = String(key).replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const VITAL_LABELS = {
  heart_rate_bpm: ["Heart rate", "bpm"],
  respiratory_rate_bpm: ["Respiratory rate", "/min"],
  spo2_pct: ["SpO2", "%"],
  temperature_c: ["Temperature", "°C"],
  gcs_total: ["GCS total", ""],
  blood_glucose_mgdl: ["Blood glucose", "mg/dL"]
};

function vitalLines(observations) {
  const values = observations ?? {};
  const lines = [];
  const { blood_pressure_systolic: systolic, blood_pressure_diastolic: diastolic } = values;
  if (systolic !== undefined || diastolic !== undefined) lines.push(`Blood pressure ${formatOrDash(systolic)}/${formatOrDash(diastolic)} mmHg`);
  for (const [key, value] of Object.entries(values)) {
    if (key === "blood_pressure_systolic" || key === "blood_pressure_diastolic" || value === null || value === undefined) continue;
    const [label, unit] = VITAL_LABELS[key] ?? [humanize(key), ""];
    lines.push(`${label} ${value}${unit ? ` ${unit}` : ""}`);
  }
  return lines;
}

/**
 * Renders a deterministic PDF for one ePCR version.
 *
 * @param {object} version - an epcr_versions row (as returned by row() in
 *   epcr-finalization.mjs -- .content is the already-parsed snapshot JSON).
 * @param {object[]} signatures - epcr_signatures rows already filtered to
 *   this specific version_id (a signature only ever attests to the exact
 *   version it was signed against; showing every signature the patient
 *   case has ever had on every version's export would misrepresent which
 *   signatures actually cover this version's content).
 * @returns {Promise<Buffer>}
 */
export async function renderPcrDocument({ version, signatures }) {
  const createdAt = new Date(version.created_at);
  const doc = new PDFDocument({
    size: "LETTER",
    margin: 50,
    // Uncompressed content streams: this is a signed compliance/audit
    // document, and being byte-inspectable (grep-able) without first
    // running it through a zlib inflate step is a small but real property
    // worth keeping for that use case; determinism itself doesn't require
    // this either way (deflate is deterministic for identical input).
    compress: false,
    info: {
      Title: `ePCR ${version.patient_case_id} v${version.version_number}`,
      Author: "V-EMS",
      Producer: "V-EMS",
      CreationDate: createdAt,
      ModDate: createdAt,
      // Stage 13 milestone 13h: a custom Info dict entry is a real,
      // parseable PDF field -- pdfkit writes every key of `info` as its
      // own indirect object, not just the standard ones -- so this
      // survives independently of anything printed in the document body.
      VemsExportFormatVersion: String(EXPORT_FORMAT_VERSION)
    }
  });
  const bufferPromise = collectPdfBuffer(doc);
  const content = version.content ?? {};

  doc.font("Helvetica-Bold").fontSize(16).text("Electronic Patient Care Record");
  doc.font("Helvetica").fontSize(10);
  field(doc, "Export format:", EXPORT_FORMAT_VERSION);
  field(doc, "Patient case:", version.patient_case_id);
  field(doc, "Version:", `${version.version_number} (${version.lifecycle_state})`);
  field(doc, "Recorded at:", version.created_at);
  field(doc, "Content hash:", `${version.hash_algorithm}:${version.content_hash}`);
  field(doc, "Correlation ID:", version.correlation_id);

  heading(doc, "Incident");
  field(doc, "Incident ID:", content.incident?.incident_id);
  field(doc, "Category:", content.incident?.category);
  field(doc, "Address:", content.incident?.address);

  heading(doc, "Patient demographics");
  const demographics = content.demographics;
  if (!demographics) {
    doc.text("No demographics recorded.");
  } else if (demographics.unidentified) {
    doc.text("Unidentified patient.");
  } else {
    field(doc, "Name:", [demographics.first_name, demographics.last_name].filter(Boolean).join(" ") || null);
    field(doc, "Date of birth:", demographics.dob);
    field(doc, "Sex:", demographics.sex);
  }

  heading(doc, "Assessments");
  const assessments = content.assessments ?? [];
  if (assessments.length === 0) doc.text("No assessments recorded.");
  for (const assessment of assessments) {
    doc.text(`${formatOrDash(assessment.section_type)} — ${formatOrDash(assessment.performed_at)}`);
    for (const [key, value] of Object.entries(assessment.payload ?? {})) {
      if (value === null || value === undefined || value === "") continue;
      optionalField(doc, `  ${humanize(key)}:`, value);
    }
  }

  heading(doc, "Vital signs");
  const observations = content.observations ?? [];
  if (observations.length === 0) doc.text("No vital signs recorded.");
  for (const observation of observations) {
    doc.text(`Recorded at ${formatOrDash(observation.performed_at)}`);
    for (const line of vitalLines(observation.observations)) doc.text(`  ${line}`);
    optionalField(doc, "  Notes:", observation.notes);
  }

  heading(doc, "Medications administered");
  const medications = content.medications ?? [];
  if (medications.length === 0) doc.text("No medications recorded.");
  for (const medication of medications) {
    const code = medication.medication_code ? ` [${medication.medication_code}]` : "";
    doc.text(`${formatOrDash(medication.medication_name)}${code} — ${formatOrDash(medication.dose)}${medication.dose_unit ?? ""} ${formatOrDash(medication.route)} at ${formatOrDash(medication.performed_at)}`);
    optionalField(doc, "  Formulation:", medication.formulation);
    optionalField(doc, "  Indication:", medication.indication);
    optionalField(doc, "  Authorization:", medication.authorization);
    optionalField(doc, "  Response:", medication.response);
    optionalField(doc, "  Adverse reaction:", medication.adverse_reaction);
    optionalField(doc, "  Stock item:", medication.stock_item_id);
    optionalField(doc, "  Quantity used:", medication.quantity_used);
  }

  heading(doc, "Procedures performed");
  const procedures = content.procedures ?? [];
  if (procedures.length === 0) doc.text("No procedures recorded.");
  for (const procedure of procedures) {
    const code = procedure.procedure_code ? ` [${procedure.procedure_code}]` : "";
    doc.text(`${formatOrDash(procedure.procedure_name)}${code} at ${formatOrDash(procedure.performed_at)}`);
    optionalField(doc, "  Type:", procedure.procedure_type);
    optionalField(doc, "  Attempts:", procedure.attempts);
    if (procedure.success !== null && procedure.success !== undefined) optionalField(doc, "  Successful:", procedure.success ? "Yes" : "No");
    optionalField(doc, "  Complications:", procedure.complications);
    optionalField(doc, "  Response:", procedure.response);
    optionalField(doc, "  Stock item:", procedure.stock_item_id);
    optionalField(doc, "  Quantity used:", procedure.quantity_used);
  }

  heading(doc, "Disposition");
  const disposition = content.disposition;
  if (!disposition) {
    doc.text("No disposition recorded.");
  } else {
    const code = disposition.outcome_code ? ` [${disposition.outcome_code}]` : "";
    field(doc, "Outcome:", `${formatOrDash(disposition.outcome)}${code}`);
    field(doc, "Destination:", disposition.destination_facility);
    optionalField(doc, "Receiving provider:", disposition.receiving_provider);
    field(doc, "Decision at:", disposition.decision_at);
    optionalField(doc, "Reason:", disposition.reason);
    optionalField(doc, "Notes:", disposition.notes);
  }

  const handover = content.encounter_link;
  if (handover?.handover_status || handover?.handover_time) {
    heading(doc, "Handover");
    field(doc, "Status:", handover.handover_status);
    field(doc, "Handover time:", handover.handover_time);
    optionalField(doc, "Disposition:", handover.disposition);
    optionalField(doc, "Destination:", handover.destination_facility);
    optionalField(doc, "Receiving clinician:", handover.receiving_clinician);
    optionalField(doc, "Notes:", handover.handover_notes);
  }

  const notes = content.notes ?? [];
  if (notes.length > 0) {
    heading(doc, "Crew notes");
    for (const note of notes) {
      doc.text(`${formatOrDash(note.authored_at)}${note.tags?.length ? ` [${note.tags.join(", ")}]` : ""}`);
      doc.text(`  ${formatOrDash(note.note_text)}`);
    }
  }

  heading(doc, "Signatures");
  if (signatures.length === 0) {
    doc.text("No signatures recorded for this version.");
  }
  for (const signature of signatures) {
    const bound = signature.record_hash === version.content_hash ? "bound to this version's content hash" : "DOES NOT match this version's content hash";
    doc.text(`${formatOrDash(signature.signer_role)} — ${formatOrDash(signature.signer_identity)} — signed ${formatOrDash(signature.signed_at)} (${bound})`);
  }

  doc.end();
  return bufferPromise;
}

/**
 * Reads the export-format version back out of a PDF this renderer
 * produced, from the /Info dict's VemsExportFormatVersion entry -- a real
 * parse of PDFKit's uncompressed object structure (indirect references
 * followed to their literal string objects), not a byte-offset hack tied
 * to any specific renderer output. Returns null if the PDF has no such
 * field (e.g. one predating this milestone, or from something else
 * entirely) rather than throwing, since "not present" is itself a
 * meaningful, testable outcome for schema-compatibility checks.
 */
export function extractExportFormatVersion(pdfBuffer) {
  const text = pdfBuffer.toString("latin1");
  const trailerInfoMatch = text.match(/\/Info\s+(\d+)\s+0\s+R/);
  if (!trailerInfoMatch) return null;
  const infoObjNum = trailerInfoMatch[1];
  const infoObjMatch = text.match(new RegExp(`(?:^|\\s)${infoObjNum} 0 obj\\s*<<([\\s\\S]*?)>>\\s*endobj`));
  if (!infoObjMatch) return null;
  const fieldRefMatch = infoObjMatch[1].match(/\/VemsExportFormatVersion\s+(\d+)\s+0\s+R/);
  if (!fieldRefMatch) return null;
  const refObjNum = fieldRefMatch[1];
  const refObjMatch = text.match(new RegExp(`(?:^|\\s)${refObjNum} 0 obj\\s*\\(([^)]*)\\)\\s*endobj`));
  return refObjMatch ? refObjMatch[1] : null;
}
