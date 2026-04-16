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
}
