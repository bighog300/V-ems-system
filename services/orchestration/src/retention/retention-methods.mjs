import { setPatientCaseLegalHold } from "./legal-hold.mjs";
import { purgeExpiredPatientCases, getPatientCaseArchives } from "./purge-job.mjs";

export const retentionMethods = {
  async setPatientCaseLegalHold(patientCaseId, payload, meta) { return setPatientCaseLegalHold(this, patientCaseId, payload, meta); },
  async purgeExpiredPatientCases(options) { return purgeExpiredPatientCases(this, options); },
  async getPatientCaseArchives(patientCaseId) { return getPatientCaseArchives(this, patientCaseId); }
};
