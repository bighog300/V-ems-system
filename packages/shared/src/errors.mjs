export class ApiError extends Error {
  constructor(code, message, status, retryable = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}
