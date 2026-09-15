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

function formatOrDash(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
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
      ModDate: createdAt
    }
  });
  const bufferPromise = collectPdfBuffer(doc);
  const content = version.content ?? {};

  doc.font("Helvetica-Bold").fontSize(16).text("Electronic Patient Care Record");
  doc.font("Helvetica").fontSize(10);
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
  }

  heading(doc, "Medications administered");
  const medications = content.medications ?? [];
  if (medications.length === 0) doc.text("No medications recorded.");
  for (const medication of medications) {
    const code = medication.medication_code ? ` [${medication.medication_code}]` : "";
    doc.text(`${formatOrDash(medication.medication_name)}${code} — ${formatOrDash(medication.dose)}${medication.dose_unit ?? ""} ${formatOrDash(medication.route)} at ${formatOrDash(medication.performed_at)}`);
  }

  heading(doc, "Procedures performed");
  const procedures = content.procedures ?? [];
  if (procedures.length === 0) doc.text("No procedures recorded.");
  for (const procedure of procedures) {
    const code = procedure.procedure_code ? ` [${procedure.procedure_code}]` : "";
    doc.text(`${formatOrDash(procedure.procedure_name)}${code} at ${formatOrDash(procedure.performed_at)}`);
  }

  heading(doc, "Disposition");
  const disposition = content.disposition;
  if (!disposition) {
    doc.text("No disposition recorded.");
  } else {
    const code = disposition.outcome_code ? ` [${disposition.outcome_code}]` : "";
    field(doc, "Outcome:", `${formatOrDash(disposition.outcome)}${code}`);
    field(doc, "Destination:", disposition.destination_facility);
    field(doc, "Decision at:", disposition.decision_at);
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
