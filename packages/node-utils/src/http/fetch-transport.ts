import type {
  FetchTransportOptions,
  HttpTransport,
} from "@/types/http";

/**
 * The default transport. Node ships fetch globally, so this costs no dependency.
 *
 * The dispatcher lives here rather than on HttpClient on purpose: it is a fetch
 * concept, and hanging it off the client would push fetch's vocabulary through the
 * seam that exists to keep the client transport-agnostic. An axios transport would
 * expose `httpAgent`/`httpsAgent` in the same position.
 */
export function createFetchTransport(
  options: FetchTransportOptions = {},
): HttpTransport {
  return async (request) => {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(request.timeoutMs),
      dispatcher: options.dispatcher,
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      // Buffered here, not handed back as a lazy fetch Response: that body is
      // one-shot, and the timeout signal above is still live until it is drained.
      body: new Uint8Array(await response.arrayBuffer()),
    };
  };
}
