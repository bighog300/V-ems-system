import { VtigerPayloadMapper } from "./vtiger-payload-mapper.mjs";

async function unsupportedTransport() {
  throw new Error("Vtiger transport is not configured");
}

function wrapTransportError(method, error) {
  const wrapped = new Error(`Vtiger adapter ${method} failed: ${error?.message ?? "Unknown transport error"}`);
  wrapped.code = error?.code ?? "DOWNSTREAM_UNAVAILABLE";
  wrapped.classification = error?.classification ?? wrapped.code;
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
    return this.invoke("createIncidentMirror", this.mapper.mapIncidentCreate(incident));
  }

  updateIncidentMirror(incident) {
    return this.invoke("updateIncidentMirror", this.mapper.mapIncidentUpdate(incident));
  }

  createAssignmentMirror(assignment) {
    return this.invoke("createAssignmentMirror", this.mapper.mapAssignmentCreate(assignment));
  }

  updateAssignmentMirror(assignment) {
    return this.invoke("updateAssignmentMirror", this.mapper.mapAssignmentUpdate(assignment));
  }

  recordStockUsageMirror(stockUsage) {
    return this.invoke("recordStockUsageMirror", this.mapper.mapStockUsageRecord(stockUsage));
  }
}
