/**
 * Application errors that map cleanly onto HTTP status codes. Route handlers
 * funnel everything through `toErrorResponse` so a thrown permission error can
 * never accidentally leak as a 500 with a stack trace.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You must be signed in.") {
    super(message, 401, "unauthorized");
  }
}

/**
 * Used for both "you may not do this" and "this record is not in your tenant".
 * Deliberately indistinguishable from the caller's point of view so that a
 * 403 vs 404 difference cannot be used to probe for records in other tenants.
 */
export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource.") {
    super(message, 403, "forbidden");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(message, 404, "not_found");
  }
}

export class ValidationError extends AppError {
  constructor(message = "The submitted data is invalid.", details?: unknown) {
    super(message, 422, "validation_error", details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "That record already exists.") {
    super(message, 409, "conflict");
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many attempts. Please try again later.") {
    super(message, 429, "rate_limited");
  }
}
