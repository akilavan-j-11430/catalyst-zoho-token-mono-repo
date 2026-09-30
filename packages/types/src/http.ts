/**
 * The shape of an HTTP response in this repo, shared by `apps/api`'s outbound
 * `HttpClient` and `apps/web`'s API client so a caller reads the same result on either
 * side. What differs between them - transports, dispatchers, execution ids - stays in
 * the package that needs it.
 *
 * Written as a frozen object rather than a TS `enum`: an enum emits runtime code, which
 * Node's strip-only type support rejects outright.
 */
export const HttpMethod = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
} as const;

export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

/** The body in whichever form the caller needs. Reading is deferred, so a response
 *  nobody reads costs nothing and a binary one is never mangled. */
export interface ResponseBody {
  /** The bytes exactly as they arrived. Use this for anything that is not text. */
  raw(): Promise<Uint8Array>;
  /** UTF-8 decoded. An empty body gives `""`. */
  text(): Promise<string>;
  /** Parsed JSON, or `undefined` for an empty body.
   *  Rejects when the body is not JSON, rather than handing back a string.
   *  `T` is asserted, not checked - name the shape the endpoint documents. */
  json<T = unknown>(): Promise<T>;
}

export interface HttpResponse {
  status: number;
  /** Lower-cased header names, as every transport is expected to supply them. */
  headers: Record<string, string>;
  body: ResponseBody;
}

export type QueryValue = string | number | boolean;

/** Resolved on every call, so a token that expires can be refreshed per request. */
export type HeaderResolver = () =>
  | Record<string, string>
  | Promise<Record<string, string>>;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  /** Merged over the client defaults, and wins where both name a header. */
  headers?: Record<string, string>;
  /** Overrides the client's timeout for this one call - a slow export, a big upload. */
  timeoutMs?: number;
}
