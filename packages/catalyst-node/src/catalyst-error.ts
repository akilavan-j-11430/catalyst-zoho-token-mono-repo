import { ErrorCode } from "@/error-codes";

/** A Catalyst operation that failed in a way the caller can act on. */
export class CatalystError extends Error {
  readonly code: ErrorCode;
  /** The SDK error this was raised from, kept for the log line. */
  readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "CatalystError";
    this.code = code;
    this.cause = cause;
  }

  /** The request asked for something the resource cannot do. */
  static InvalidResource(message: string, cause?: unknown): CatalystError {
    return new CatalystError(ErrorCode.INVALID_RESOURCE, message, cause);
  }

  /** The addressed resource does not exist. */
  static ResourceNotFound(message: string, cause?: unknown): CatalystError {
    return new CatalystError(ErrorCode.RESOURCE_NOT_FOUND, message, cause);
  }

  /** The request's headers cannot build an app for the scope - for User, usually because
   *  it carries no signed-in user. `reason` is the SDK's code and message only. */
  static ScopeUnavailable(scope: string, reason: string): CatalystError {
    return new CatalystError(
      ErrorCode.SCOPE_UNAVAILABLE,
      `No ${scope}-scope Catalyst app for this request: ${reason}`,
    );
  }

  override toString(): string {
    const lines = [`${this.name}[${this.code}]: ${this.message}`];
    if (this.cause !== undefined) {
      lines.push(`Cause: ${describe(this.cause)}`);
    }
    if (this.stack) {
      lines.push(`Stack\n${this.stack}`);
    }
    return lines.join("\n");
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
