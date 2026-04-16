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

  async createObservation(observation) {
    const response = await this.transport({
      method: "createObservation",
      payload: this.mapper.mapObservationCreateRequest(observation)
    });
    return this.mapper.mapObservationCreateResponse(response);
  }

  async createIntervention(intervention) {
    const response = await this.transport({
      method: "createIntervention",
      payload: this.mapper.mapInterventionCreateRequest(intervention)
    });
    return this.mapper.mapInterventionCreateResponse(response);
  }

  async getInterventions(context) {
    const response = await this.transport({
      method: "getInterventions",
      payload: this.mapper.mapInterventionReadRequest(context)
    });
    return this.mapper.mapInterventionReadResponse(response);
  }

  async createHandover(handover) {
    const response = await this.transport({
      method: "createHandover",
      payload: this.mapper.mapHandoverCreateRequest(handover)
    });
    return this.mapper.mapHandoverCreateResponse(response);
  }

  async getHandover(context) {
    const response = await this.transport({
      method: "getHandover",
      payload: this.mapper.mapHandoverReadRequest(context)
    });
    return this.mapper.mapHandoverReadResponse(response);
  }
}
