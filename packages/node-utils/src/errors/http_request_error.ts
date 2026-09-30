import type { HttpMethod } from "@/enums/http_method";
import { RuntimeError } from "@/errors/runtime_error";

/** Everything known about a failed call, flat and synchronous so it can be logged. */
interface Failure {
  method: HttpMethod;
  url: string;
  status?: number;
  headers?: Record<string, string>;
  body?: string;
}

/** A failure where a response did arrive, so the wire details are all known. */
export interface ResponseFailure {
  method: HttpMethod;
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** An outbound request that did not come back with a usable 2xx, or did not come back. */
export class HttpRequestError extends RuntimeError {
  readonly method: HttpMethod;
  readonly url: string;
  /** Absent only when nothing came back - timeout, DNS failure, connection refused. */
  readonly status?: number;
  readonly headers?: Record<string, string>;
  /** The response body as text, captured when the call failed. Held as a string rather
   *  than behind the response's promise API so logging a failure never has to await. */
  readonly body?: string;

  private constructor(message: string, failure: Failure) {
    super(message);
    this.name = "HttpRequestError";
    this.method = failure.method;
    this.url = failure.url;
    this.status = failure.status;
    this.headers = failure.headers;
    this.body = failure.body;
  }

  /** Upstream answered with a non-2xx. */
  static Upstream(failure: ResponseFailure): HttpRequestError {
    return new HttpRequestError(
      `${failure.method} ${failure.url} responded ${failure.status}`,
      failure,
    );
  }

  /** `body.json()` was read on a body that is not JSON. */
  static Undecodable(failure: ResponseFailure): HttpRequestError {
    return new HttpRequestError(
      `${failure.method} ${failure.url} responded ${failure.status} with a body that is not JSON`,
      failure,
    );
  }

  /** No response at all - timeout, DNS failure, connection refused. */
  static Unreachable(
    method: HttpMethod,
    url: string,
    cause: string,
  ): HttpRequestError {
    return new HttpRequestError(
      `${method} ${url} could not be reached: ${cause}`,
      { method, url },
    );
  }

  /** What `logger` prints, so a failure is diagnosable from the log line alone. */
  override toString(): string {
    const lines = [`${this.name}: ${this.message}`];
    if (this.status !== undefined) {
      lines.push(`Status: ${this.status}`);
    }
    if (this.headers) {
      lines.push(`Headers: ${JSON.stringify(this.headers)}`);
    }
    if (this.body !== undefined) {
      lines.push(`Body: ${this.body}`);
    }
    if (this.stack) {
      lines.push(`Stack\n${this.stack}`);
    }
    return lines.join("\n");
  }
}
