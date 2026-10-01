import { RuntimeError } from "@/errors/runtime_error";

/** The codes this repo raises itself, plus the Zoho one a route matches on. Zoho's other
 *  `error` values - `invalid_client` and the rest - arrive in the same field, so `code`
 *  stays a plain string. */
export const ZohoAuthErrorCode = {
  /** No grant is stored for this reference id. */
  NotConnected: "not_connected",
  InvalidReferenceId: "invalid_reference_id",
  /** `ZohoConnection.setCredentials` was never called. */
  NotConfigured: "not_configured",
  /** The callback's `state` is not the one issued to this user. */
  StateMismatch: "state_mismatch",
  /** Zoho's own code for a grant code that is expired, already used, or simply wrong. */
  InvalidGrantCode: "invalid_code",
  /** Zoho answered, but with something that is not a JSON object. */
  UnreadableResponse: "unreadable_response",
  MissingRefreshToken: "missing_refresh_token",
  MissingAccessToken: "missing_access_token",
  /** The accounts server never answered - timeout, DNS failure, connection refused. */
  AccountsUnreachable: "accounts_unreachable",
} as const;

export type ZohoAuthErrorCode =
  (typeof ZohoAuthErrorCode)[keyof typeof ZohoAuthErrorCode];

/** Names the status Zoho answered with, so a route can match one without matching all. */
export function accountsHttpCode(status: number): string {
  return `accounts_http_${status}`;
}

/** Zoho refused an OAuth exchange, or never answered one. Carries a code so a route can
 *  tell a bad grant code from a misconfigured client from an unreachable server. */
export class ZohoAuthError extends RuntimeError {
  readonly code: string;
  /** The error this was raised from, kept for the log line. */
  readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = "ZohoAuthError";
    this.code = code;
    this.cause = cause;
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
