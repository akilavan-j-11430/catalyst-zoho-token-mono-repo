import type { HttpMethod } from "@/http-method";
import type {
  HeaderResolver,
  HttpResponse,
  QueryValue,
  RequestOptions,
  ResponseBody,
} from "@repo/types/http";

export type {
  HeaderResolver,
  HttpResponse,
  QueryValue,
  RequestOptions,
  ResponseBody,
};

/** What a transport is expected to put on the wire as-is. Deliberately not fetch's
 *  `BodyInit`: that includes streams, which not every client can consume. */
export type RequestBody =
  | string
  | Uint8Array<ArrayBuffer>
  | ArrayBuffer
  | Blob
  | URLSearchParams
  | FormData;

/** A fully resolved request. The client has already applied the query string,
 *  merged the headers and encoded the body. */
export interface TransportRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: RequestBody;
  timeoutMs: number;
}

/** Undecoded bytes plus the response headers. Deciding what the bytes mean is the
 *  client's job, and decoding here would make a binary response unrecoverable. */
export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

/**
 * The single seam between HttpClient and whatever library puts bytes on the wire.
 * Moving off fetch means writing one more implementation of this and passing it to
 * the client - no call site changes.
 *
 * A transport puts the request on the wire and reports what came back. It does not
 * decide what a status means and does not throw for a non-2xx.
 */
export type HttpTransport = (
  request: TransportRequest,
) => Promise<TransportResponse>;

/** Where the client writes one line per call - on the server a `Logger`, in the browser
 *  `console`. Without one, the client logs nothing. */
export interface HttpCallLogger {
  info(message: string): void;
}

export interface HttpClientOptions {
  /** Absolute base every path is resolved against. Its own path is preserved. */
  baseUrl: string;
  logger?: HttpCallLogger;
  /** Authorization and anything else every call to this service carries. */
  headers?: HeaderResolver;
  timeoutMs?: number;
  /** Swap seam - defaults to `fetchTransport`. A Node-only transport - an undici
   *  dispatcher for pooling, proxying or mTLS - is written beside it when one is needed. */
  transport?: HttpTransport;
}
