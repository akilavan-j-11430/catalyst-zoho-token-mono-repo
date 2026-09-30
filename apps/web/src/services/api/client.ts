import type { ErrorResponse, RecordResponse } from "@repo/types/api";
import {
  HttpMethod,
  type HeaderResolver,
  type HttpResponse,
  type QueryValue,
  type RequestOptions,
} from "@repo/types/http";

/**
 * The shared `HttpResponse` plus the request that produced it, so a failure raised while
 * reading the body still names the call - the server's client keeps those in a closure,
 * and `recordOf` below is read outside one.
 */
export interface ApiResponse extends HttpResponse {
  readonly method: HttpMethod;
  readonly url: string;
}

export type { QueryValue, RequestOptions };

export interface ApiClientOptions {
  /**
   * Prefixed onto every path. Relative on purpose, unlike the server's client, which
   * demands an absolute URL: `apps/proxy` gives the browser and the API one origin, and
   * an absolute base would send the call cross-origin, arriving without the session
   * cookie and without the Catalyst headers `zcAuth.init(req)` reads.
   */
  baseUrl: string;
  /** Anything every call carries. Resolved per call, so an expiring token can refresh. */
  headers?: HeaderResolver;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** A failure where a response did arrive, so the wire details are all known. */
interface ResponseFailure {
  method: HttpMethod;
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * The API's own message when it sent one. Unlike the server's `HttpRequestError`, this
 * error is shown to a person rather than logged, so the envelope's message wins over
 * `POST /x responded 409`.
 */
function describe(body: string): string | undefined {
  try {
    const { message } = JSON.parse(body) as ErrorResponse;
    return typeof message === "string" && message !== "" ? message : undefined;
  } catch {
    return undefined;
  }
}

/** Everything known about a failed call, flat and synchronous so it can be logged. */
export class ApiError extends Error {
  readonly method: HttpMethod;
  readonly url: string;
  /** Absent only when nothing came back - timeout, offline, DNS failure. */
  readonly status?: number;
  readonly headers?: Record<string, string>;
  readonly body?: string;

  private constructor(
    message: string,
    failure: {
      method: HttpMethod;
      url: string;
      status?: number;
      headers?: Record<string, string>;
      body?: string;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.method = failure.method;
    this.url = failure.url;
    this.status = failure.status;
    this.headers = failure.headers;
    this.body = failure.body;
  }

  /** The API answered with a non-2xx. */
  static Upstream(failure: ResponseFailure): ApiError {
    const message =
      describe(failure.body) ??
      `${failure.method} ${failure.url} responded ${failure.status}`;
    return new ApiError(message, failure);
  }

  /** `body.json()` was read on a body that is not JSON. */
  static Undecodable(failure: ResponseFailure): ApiError {
    return new ApiError("The server returned an unreadable response.", failure);
  }

  /** No response at all - timeout, offline, DNS failure. */
  static Unreachable(method: HttpMethod, url: string): ApiError {
    return new ApiError("Could not reach the server. Check your connection.", {
      method,
      url,
    });
  }

  override toString(): string {
    const lines = [`${this.name}: ${this.method} ${this.url} - ${this.message}`];
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

/** Buffered once, so the three readers below are all available and re-readable. */
function toApiResponse(
  method: HttpMethod,
  url: string,
  status: number,
  headers: Record<string, string>,
  bytes: Uint8Array,
): ApiResponse {
  const decode = (): string => new TextDecoder().decode(bytes);
  return {
    method,
    url,
    status,
    headers,
    body: {
      raw: async () => bytes,
      text: async () => decode(),
      json: async <T = unknown>(): Promise<T> => {
        const text = decode();
        if (text.length === 0) {
          return undefined as T;
        }
        try {
          return JSON.parse(text) as T;
        } catch {
          throw ApiError.Undecodable({ method, url, status, headers, body: text });
        }
      },
    },
  };
}

/** What goes on the wire, and the content type that goes with it. */
function encodeBody(body: unknown): {
  body?: BodyInit;
  contentType?: string;
} {
  if (body === undefined) {
    return {};
  }
  // FormData and URLSearchParams carry their own encoding - FormData's multipart boundary
  // is generated with its bytes, so declaring a type here would corrupt it.
  if (body instanceof FormData || body instanceof URLSearchParams) {
    return { body };
  }
  if (typeof body === "string") {
    return { body, contentType: "text/plain" };
  }
  if (body instanceof Blob || body instanceof ArrayBuffer) {
    return { body, contentType: "application/octet-stream" };
  }
  return { body: JSON.stringify(body), contentType: "application/json" };
}

/**
 * The one place this app speaks HTTP, and the browser's counterpart to the server's
 * `HttpClient`. Every call resolves to the whole response - status, headers, and a body
 * read as `json()`, `text()` or `raw()` - so a caller that needs a header or a non-JSON
 * payload is not fighting the client for it. A non-2xx and an unreachable server both
 * reject with `ApiError`.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly resolveHeaders: HeaderResolver;
  private readonly timeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.resolveHeaders = options.headers ?? (() => ({}));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get(path: string, options?: RequestOptions): Promise<ApiResponse> {
    return this.send(HttpMethod.Get, path, undefined, options);
  }

  post(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse> {
    return this.send(HttpMethod.Post, path, body, options);
  }

  put(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse> {
    return this.send(HttpMethod.Put, path, body, options);
  }

  patch(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse> {
    return this.send(HttpMethod.Patch, path, body, options);
  }

  delete(path: string, options?: RequestOptions): Promise<ApiResponse> {
    return this.send(HttpMethod.Delete, path, undefined, options);
  }

  private async send(
    method: HttpMethod,
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<ApiResponse> {
    const url = this.resolveUrl(path, options?.query);
    const encoded = encodeBody(body);
    const headers: Record<string, string> = {
      ...(encoded.contentType ? { "content-type": encoded.contentType } : {}),
      ...(await this.resolveHeaders()),
      ...options?.headers,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: encoded.body,
        signal: AbortSignal.timeout(options?.timeoutMs ?? this.timeoutMs),
      });
    } catch {
      throw ApiError.Unreachable(method, url);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const received = Object.fromEntries(response.headers);
    if (!response.ok) {
      throw ApiError.Upstream({
        method,
        url,
        status: response.status,
        headers: received,
        body: new TextDecoder().decode(bytes),
      });
    }
    return toApiResponse(method, url, response.status, received, bytes);
  }

  private resolveUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = `${this.baseUrl}/${path.replace(/^\/+/, "")}`;
    if (query === undefined) {
      return url;
    }
    const search = new URLSearchParams(
      Object.entries(query).map(([name, value]) => [name, String(value)]),
    );
    return `${url}?${search.toString()}`;
  }
}

/**
 * `apps/api` answers every route with `{ status, data }`. This is the only place that
 * knows that, so a service reads a record and never the envelope around it.
 */
export async function recordOf<T>(response: ApiResponse): Promise<T> {
  const payload = await response.body.json<RecordResponse<T> | undefined>();
  if (payload === undefined) {
    // A 2xx with no body where a record was promised is a bug on the server, not
    // something the person reading the toast can act on.
    throw ApiError.Undecodable({
      method: response.method,
      url: response.url,
      status: response.status,
      headers: response.headers,
      body: "",
    });
  }
  return payload.data;
}

/**
 * One instance for `apps/api`. The prefix lives here rather than on every path, and stays
 * relative so the proxy keeps the browser and the API on one origin.
 */
export const api = new ApiClient({ baseUrl: "/api" });
