export class ApiError extends Error {
  constructor(message, { status, code, retryable, correlationId, requestId, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.correlationId = correlationId;
    this.requestId = requestId;
    this.details = details;
  }
}
