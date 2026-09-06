import { VtigerPayloadMapper } from "./vtiger-payload-mapper.mjs";

async function unsupportedTransport() {
  throw new Error("Vtiger transport is not configured");
}

function wrapTransportError(method, error) {
  const wrapped = new Error(`Vtiger adapter ${method} failed: ${error?.message ?? "Unknown transport error"}`);
  wrapped.code = error?.code ?? "DOWNSTREAM_UNAVAILABLE";
  wrapped.classification = error?.classification ?? wrapped.code;
  wrapped.retryable = error?.retryable;
  wrapped.outcomeUnknown = error?.outcomeUnknown;
  wrapped.operation = method;
  wrapped.cause = error;
  return wrapped;
}

export class VtigerAdapterClient {
  constructor(options = {}) {
    this.mapper = options.mapper ?? new VtigerPayloadMapper();
    this.transport = options.transport ?? unsupportedTransport;
  }

  async invoke(method, payload) {
    try {
      return await this.transport({ method, payload });
    } catch (error) {
      throw wrapTransportError(method, error);
    }
  }

  createIncidentMirror(incident) {
    return this.invoke("createIncidentMirror", incident?.vems_incident_id ? incident : this.mapper.mapIncidentCreate(incident));
  }

  updateIncidentMirror(incident) {
    return this.invoke("updateIncidentMirror", incident?.vems_incident_id ? incident : this.mapper.mapIncidentUpdate(incident));
  }

  createAssignmentMirror(assignment) {
    return this.invoke("createAssignmentMirror", assignment?.vems_assignment_id ? assignment : this.mapper.mapAssignmentCreate(assignment));
  }

  updateAssignmentMirror(assignment) {
    return this.invoke("updateAssignmentMirror", assignment?.vems_assignment_id ? assignment : this.mapper.mapAssignmentUpdate(assignment));
  }

  createVehicleMirror(vehicle) {
    return this.invoke("createVehicleMirror", vehicle?.vems_vehicle_id ? vehicle : this.mapper.mapVehicleCreate(vehicle));
  }

  updateVehicleMirror(vehicle) {
    return this.invoke("updateVehicleMirror", vehicle?.vems_vehicle_id ? vehicle : this.mapper.mapVehicleUpdate(vehicle));
  }

  createPersonnelMirror(personnel) {
    return this.invoke("createPersonnelMirror", personnel?.vems_staff_id ? personnel : this.mapper.mapPersonnelCreate(personnel));
  }

  updatePersonnelMirror(personnel) {
    return this.invoke("updatePersonnelMirror", personnel?.vems_staff_id ? personnel : this.mapper.mapPersonnelUpdate(personnel));
  }

  createAssignmentCrewMirror(link) {
    return this.invoke("createAssignmentCrewMirror", link?.vems_assignment_crew_id ? link : this.mapper.mapAssignmentCrewCreate(link));
  }

  recordStockUsageMirror(stockUsage) {
    return this.invoke("recordStockUsageMirror", this.mapper.mapStockUsageRecord(stockUsage));
  }
}
