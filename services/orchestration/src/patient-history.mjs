// Closes the "history retrieval" gap flagged in the crew-tablet workflow
// sketch: searchPatient() only matches an identity, it never fetches a
// chart. This adds a read-only view of a linked patient's prior
// medications and recent encounters, sourced from OpenEMR (the system of
// record for patient identity/history) via the same
// OpenEmrAdapterClient/OpenEmrPayloadMapper transport pattern every other
// OpenEMR call already uses.
//
// Deliberately read-only and un-cached server-side: V-EMS never writes to
// a patient's prior history, only displays it, and nothing here decides
// whether/how long a mobile client may cache it offline -- that's a
// separate, real PHI-at-rest tradeoff for the client to make, not a
// default this endpoint should silently impose.

import { ApiError } from "@vems/shared";

export const patientHistoryMethods = {
  async getPatientCaseHistory(patientCaseId, meta) {
    const patientCase = await this.getPatientCase(patientCaseId);
    if (!patientCase.openemr_patient_id) {
      throw new ApiError("CONFLICT", "Patient case has no linked patient; link a patient before viewing history", 409);
    }
    const history = await this.openemr.getPatientHistory({ patient_id: patientCase.openemr_patient_id });
    await this.audit("patient_history", patientCase.openemr_patient_id, "view_patient_history", meta, undefined, { patient_case_id: patientCaseId, ...history });
    return { patient_case_id: patientCaseId, openemr_patient_id: patientCase.openemr_patient_id, ...history };
  }
};
