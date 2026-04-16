export class OpenEmrPayloadMapper {
  mapPatientSearchRequest(criteria) {
    return {
      first_name: criteria.first_name,
      last_name: criteria.last_name,
      dob: criteria.dob,
      sex: criteria.sex,
      phone: criteria.phone
    };
  }

  mapPatientCreateRequest(patient) {
    return {
      first_name: patient.first_name,
      last_name: patient.last_name,
      dob: patient.dob,
      sex: patient.sex,
      phone: patient.phone
    };
  }


  mapEncounterCreateRequest(encounter) {
    return {
      incident_id: encounter.incident_id,
      patient_id: encounter.patient_id,
      care_started_at: encounter.care_started_at,
      crew_ids: encounter.crew_ids,
      presenting_complaint: encounter.presenting_complaint
    };
  }

  mapObservationCreateRequest(observation) {
    return {
      encounter_id: observation.encounter_id,
      incident_id: observation.incident_id,
      patient_id: observation.patient_id,
      recorded_at: observation.recorded_at,
      source: observation.source,
      notes: observation.notes,
      vital_signs: observation.vital_signs
    };
  }

  mapInterventionCreateRequest(intervention) {
    return {
      encounter_id: intervention.encounter_id,
      incident_id: intervention.incident_id,
      patient_id: intervention.patient_id,
      performed_at: intervention.performed_at,
      type: intervention.type,
      name: intervention.name,
      dose: intervention.dose,
      route: intervention.route,
      response: intervention.response,
      stock_item_id: intervention.stock_item_id
    };
  }

  mapPatientSearchResponse(response) {
    return {
      match_status: response.match_status,
      match_confidence: response.match_confidence,
      patient_id: response.patient_id ?? null,
      candidates: Array.isArray(response.candidates) ? response.candidates : []
    };
  }

  mapPatientCreateResponse(response) {
    return {
      patient_id: response.patient_id,
      display_name: response.display_name
    };
  }

  mapEncounterCreateResponse(response) {
    return {
      encounter_id: response.encounter_id,
      status: response.status
    };
  }

  mapObservationCreateResponse(response) {
    return {
      observation_id: response.observation_id,
      encounter_id: response.encounter_id,
      status: response.status
    };
  }

  mapInterventionCreateResponse(response) {
    return {
      intervention_id: response.intervention_id,
      encounter_id: response.encounter_id,
      status: response.status
    };
  }
}
