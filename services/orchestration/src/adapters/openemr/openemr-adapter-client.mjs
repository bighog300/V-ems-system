import { OpenEmrPayloadMapper } from "./openemr-payload-mapper.mjs";

async function unsupportedTransport() {
  throw new Error("OpenEMR transport is not configured");
}

export class OpenEmrAdapterClient {
  constructor(options = {}) {
    this.mapper = options.mapper ?? new OpenEmrPayloadMapper();
    this.transport = options.transport ?? unsupportedTransport;
  }

  async searchPatient(criteria) {
    const response = await this.transport({
      method: "searchPatient",
      payload: this.mapper.mapPatientSearchRequest(criteria)
    });
    return this.mapper.mapPatientSearchResponse(response);
  }

  async createPatient(patient) {
    const response = await this.transport({
      method: "createPatient",
      payload: this.mapper.mapPatientCreateRequest(patient)
    });
    return this.mapper.mapPatientCreateResponse(response);
  }

  async createEncounter(encounter) {
    const response = await this.transport({
      method: "createEncounter",
      payload: this.mapper.mapEncounterCreateRequest(encounter)
    });
    return this.mapper.mapEncounterCreateResponse(response);
  }
}
