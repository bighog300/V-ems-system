import { VtigerPayloadMapper } from "./vtiger-payload-mapper.mjs";

async function unsupportedTransport() {
  throw new Error("Vtiger transport is not configured");
}

export class VtigerAdapterClient {
  constructor(options = {}) {
    this.mapper = options.mapper ?? new VtigerPayloadMapper();
    this.transport = options.transport ?? unsupportedTransport;
  }

  createIncidentMirror(incident) {
    return this.transport({
      method: "createIncidentMirror",
      payload: this.mapper.mapIncidentCreate(incident)
    });
  }

  updateIncidentMirror(incident) {
    return this.transport({
      method: "updateIncidentMirror",
      payload: this.mapper.mapIncidentUpdate(incident)
    });
  }

  createAssignmentMirror(assignment) {
    return this.transport({
      method: "createAssignmentMirror",
      payload: this.mapper.mapAssignmentCreate(assignment)
    });
  }

  updateAssignmentMirror(assignment) {
    return this.transport({
      method: "updateAssignmentMirror",
      payload: this.mapper.mapAssignmentUpdate(assignment)
    });
  }
}
