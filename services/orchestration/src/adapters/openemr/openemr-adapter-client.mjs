import { OpenEmrPayloadMapper } from "./openemr-payload-mapper.mjs";

async function unsupportedTransport() {
  throw new Error("OpenEMR transport is not configured");
}

function wrapTransportError(method, error) {
  const wrapped = new Error(`OpenEMR adapter ${method} failed: ${error?.message ?? "Unknown transport error"}`);
  wrapped.code = error?.code ?? "DOWNSTREAM_UNAVAILABLE";
  wrapped.classification = error?.classification ?? wrapped.code;
  wrapped.cause = error;
  return wrapped;
}

export class OpenEmrAdapterClient {
  constructor(options = {}) {
    this.mapper = options.mapper ?? new OpenEmrPayloadMapper();
    this.transport = options.transport ?? unsupportedTransport;
  }

  async invoke(method, payload) {
    try {
      return await this.transport({ method, payload });
    } catch (error) {
      throw wrapTransportError(method, error);
    }
  }

  async searchPatient(criteria) {
    const response = await this.invoke("searchPatient", this.mapper.mapPatientSearchRequest(criteria));
    return this.mapper.mapPatientSearchResponse(response);
  }

  async createPatient(patient) {
    const response = await this.invoke("createPatient", this.mapper.mapPatientCreateRequest(patient));
    return this.mapper.mapPatientCreateResponse(response);
  }

  async createEncounter(encounter) {
    const response = await this.invoke("createEncounter", this.mapper.mapEncounterCreateRequest(encounter));
    return this.mapper.mapEncounterCreateResponse(response);
  }

  async createObservation(observation) {
    const response = await this.invoke("createObservation", this.mapper.mapObservationCreateRequest(observation));
    return this.mapper.mapObservationCreateResponse(response);
  }

  async createIntervention(intervention) {
    const response = await this.invoke("createIntervention", this.mapper.mapInterventionCreateRequest(intervention));
    return this.mapper.mapInterventionCreateResponse(response);
  }

  async getInterventions(context) {
    const response = await this.invoke("getInterventions", this.mapper.mapInterventionReadRequest(context));
    return this.mapper.mapInterventionReadResponse(response);
  }

  async createHandover(handover) {
    const response = await this.invoke("createHandover", this.mapper.mapHandoverCreateRequest(handover));
    return this.mapper.mapHandoverCreateResponse(response);
  }

  async getHandover(context) {
    const response = await this.invoke("getHandover", this.mapper.mapHandoverReadRequest(context));
    return this.mapper.mapHandoverReadResponse(response);
  }
}
