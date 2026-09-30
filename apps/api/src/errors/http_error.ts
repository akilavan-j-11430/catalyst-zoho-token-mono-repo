
/** Failure a route wants rendered as a specific HTTP status. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  private constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }

  /** The request body failed validation. */
  static BadRequest(message: string): HttpError {
    return new HttpError(400, "BAD_REQUEST", message);
  }

  /** No signed-in user for the request. */
  static Unauthorized(message: string): HttpError {
    return new HttpError(401, "UNAUTHORIZED", message);
  }

  /** The addressed resource does not exist. */
  static NotFound(message: string): HttpError {
    return new HttpError(404, "NOT_FOUND", message);
  }

  /** The request conflicts with the current state of the resource. */
  static Conflict(message: string): HttpError {
    return new HttpError(409, "CONFLICT", message);
  }
}
