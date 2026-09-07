export interface ApiErrorDetails {
  status?: number;
  code?: string;
  retryable?: boolean;
  correlationId?: string;
  requestId?: string;
  details?: unknown;
}

export class ApiError extends Error {
  status?: number;
  code?: string;
  retryable?: boolean;
  correlationId?: string;
  requestId?: string;
  details?: unknown;

  constructor(message: string, options: ApiErrorDetails = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable;
    this.correlationId = options.correlationId;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string, options: ApiErrorDetails = {}) {
    super(message, options);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string, options: ApiErrorDetails = {}) {
    super(message, options);
    this.name = "ForbiddenError";
  }
}
