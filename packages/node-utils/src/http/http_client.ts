import { ContentType } from "@/enums/content_type";
import { HttpHeader } from "@/enums/http_header";
import { HttpMethod } from "@/enums/http_method";
import { HttpRequestError } from "@/errors/http_request_error";
import { RuntimeError } from "@/errors/runtime_error";
import { currentContext } from "@/framework/async_context";
import { logger } from "@/framework/logger";
import { createFetchTransport } from "@/http/fetch_transport";
import { toHttpResponse } from "@/http/response";
import type {
  HeaderResolver,
  HttpClientOptions,
  HttpResponse,
  HttpTransport,
  QueryValue,
  RequestBody,
  RequestOptions,
} from "@/types/http";

const DEFAULT_TIMEOUT_MS = 10_000;

/** Shared so every client without its own transport reuses undici's global pool. */
const defaultTransport = createFetchTransport();

/** A content type carries parameters - `application/json; charset=utf-8` - which are not
 *  part of the type itself, so comparisons only ever look at the media type. */
function mediaType(value: string): string {
  return value.split(";")[0]!.trim().toLowerCase();
}

/**
 * Lifted out of the merged headers so exactly one content type reaches the wire rather
 * than two spellings of it, and so the body can be checked against what it claims to be.
 */
function takeDeclaredContentType(
  headers: Record<string, string>,
): string | undefined {
  let declared: string | undefined;
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === HttpHeader.ContentType) {
      declared = headers[key];
      delete headers[key];
    }
  }
  return declared;
}

/** What `send` puts on the wire, and the content type that goes with it. */
interface EncodedBody {
  body?: RequestBody;
  /** `undefined` leaves the header off so the transport derives it - FormData's
   *  multipart boundary is generated with its bytes and cannot be predicted here. */
  contentType?: string;
}

function isBinary(body: unknown): body is Uint8Array | ArrayBuffer | Blob {
  return (
    body instanceof Uint8Array ||
    body instanceof ArrayBuffer ||
    body instanceof Blob
  );
}

/**
 * The body decides its own encoding, the way every mainstream client works: an object
 * becomes JSON, a string is text, bytes are binary, and the form types are left to the
 * transport. A declared type may refine that - `text/plain` to `application/xml` - but
 * never contradict it, because a label the bytes do not match is a bug that only shows
 * up at the far end.
 */
function encodeBody(body: unknown, declared?: string): EncodedBody {
  if (body === undefined) {
    if (declared) {
      throw new RuntimeError(`Got a ${declared} content type but no body to send.`);
    }
    return {};
  }
  if (body instanceof FormData) {
    if (declared) {
      throw new RuntimeError(
        `A FormData body is always ${ContentType.Multipart} with a generated boundary, so it cannot be sent as ${declared}.`,
      );
    }
    return { body };
  }
  if (body instanceof URLSearchParams) {
    if (declared && mediaType(declared) !== ContentType.FormUrlEncoded) {
      throw new RuntimeError(
        `A URLSearchParams body is always ${ContentType.FormUrlEncoded}, so it cannot be sent as ${declared}.`,
      );
    }
    return { body };
  }
  if (typeof body === "string") {
    return { body, contentType: declared ?? ContentType.Text };
  }
  if (isBinary(body)) {
    return { body, contentType: declared ?? ContentType.OctetStream };
  }
  if (declared && mediaType(declared) !== ContentType.Json) {
    throw new RuntimeError(
      `This body is serialized as ${ContentType.Json}, so it cannot be sent as ${declared}. Encode it yourself and pass a string.`,
    );
  }
  return { body: JSON.stringify(body), contentType: declared ?? ContentType.Json };
}

/** Stamps the in-flight request's execution id on the call so an upstream log line can be
 *  traced back to the request that caused it. Left off outside a request context - a cron
 *  or a startup call has no execution to attribute it to. */
function executionHeader(): Record<string, string> {
  try {
    return { [HttpHeader.AppExecutionId]: currentContext().manager.executionId };
  } catch {
    // outside request context
    return {};
  }
}

/** One instance per external service. Every outbound request in this repo goes through here. */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly resolveHeaders: HeaderResolver;
  private readonly timeoutMs: number;
  private readonly transport: HttpTransport;

  constructor(options: HttpClientOptions) {
    if (!URL.canParse(options.baseUrl)) {
      throw new RuntimeError(
        `HttpClient needs an absolute baseUrl, got "${options.baseUrl}"`,
      );
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.resolveHeaders = options.headers ?? (() => ({}));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.transport = options.transport ?? defaultTransport;
  }

  get(path: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.send(HttpMethod.Get, path, undefined, options);
  }

  post(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<HttpResponse> {
    return this.send(HttpMethod.Post, path, body, options);
  }

  put(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<HttpResponse> {
    return this.send(HttpMethod.Put, path, body, options);
  }

  patch(
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<HttpResponse> {
    return this.send(HttpMethod.Patch, path, body, options);
  }

  delete(path: string, options?: RequestOptions): Promise<HttpResponse> {
    return this.send(HttpMethod.Delete, path, undefined, options);
  }

  private async send(
    method: HttpMethod,
    path: string,
    body: unknown,
    options?: RequestOptions,
  ): Promise<HttpResponse> {
    const url = this.resolveUrl(path, options?.query);
    const headers = {
      ...executionHeader(),
      ...(await this.resolveHeaders()),
      ...options?.headers,
    };
    const encoded = encodeBody(body, takeDeclaredContentType(headers));
    if (encoded.contentType) {
      headers[HttpHeader.ContentType] = encoded.contentType;
    }
    const request = {
      method,
      url,
      headers,
      body: encoded.body,
      timeoutMs: options?.timeoutMs ?? this.timeoutMs,
    };

    const startedAt = Date.now();
    let transported;
    try {
      transported = await this.transport(request);
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw HttpRequestError.Unreachable(method, url, cause);
    }
    logger.info(
      `${method} ${url} -> ${transported.status} in ${Date.now() - startedAt} ms`,
    );

    if (transported.status < 200 || transported.status >= 300) {
      throw HttpRequestError.Upstream({
        method,
        url,
        status: transported.status,
        headers: transported.headers,
        body: new TextDecoder().decode(transported.body),
      });
    }
    return toHttpResponse(method, url, transported);
  }

  private resolveUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\/+/, "")}`);
    for (const [name, value] of Object.entries(query ?? {})) {
      url.searchParams.set(name, String(value));
    }
    return url.toString();
  }

}
