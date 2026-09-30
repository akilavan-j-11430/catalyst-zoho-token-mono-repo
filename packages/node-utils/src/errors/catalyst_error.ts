import { ErrorCode } from "@/enums/error_codes";
import { RuntimeError } from "@/errors/runtime_error";

/** A Catalyst operation that failed in a way the caller can act on. */
export class CatalystError extends RuntimeError {
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
