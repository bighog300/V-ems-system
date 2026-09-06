const RETRYABLE = new Set(["VTIGER_UNAVAILABLE", "VTIGER_SERVER_ERROR", "VTIGER_RATE_LIMITED", "VTIGER_OUTCOME_UNKNOWN"]);

export class VtigerError extends Error {
  constructor(code, message, { operation, httpStatus, outcomeUnknown = false, cause } = {}) {
    super(message);
    this.name = "VtigerError";
    this.code = code;
    this.classification = code;
    this.retryable = RETRYABLE.has(code);
    this.operation = operation;
    this.httpStatus = httpStatus;
    this.outcomeUnknown = outcomeUnknown;
    this.cause = cause;
  }
}

export function sanitizeMessage(message) {
  return String(message ?? "Vtiger request failed").replace(/[\r\n]+/g, " ").slice(0, 300);
}

export function classifyVtigerError(error, operation) {
  if (error instanceof VtigerError) return error;
  return new VtigerError("VTIGER_UNAVAILABLE", sanitizeMessage(error?.message), { operation, cause: error });
}
