import type { HttpTransport } from "@/http-types";

/**
 * The default transport. Node and the browser both ship fetch globally, so this costs no
 * dependency, and on Node every client shares undici's global connection pool.
 */
export const fetchTransport: HttpTransport = async (request) => {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: AbortSignal.timeout(request.timeoutMs),
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    // Buffered here, not handed back as a lazy fetch Response: that body is
    // one-shot, and the timeout signal above is still live until it is drained.
    body: new Uint8Array(await response.arrayBuffer()),
  };
};
