import type { HttpMethod } from "@/http-method";
import { HttpRequestError } from "@/http-request-error";
import type { HttpResponse, TransportResponse } from "@/http-types";

export function toHttpResponse(
  method: HttpMethod,
  url: string,
  transported: TransportResponse,
): HttpResponse {
  const { status, headers } = transported;
  const bytes = transported.body;
  return {
    status,
    headers,
    body: {
      raw: async () => bytes,
      text: async () => new TextDecoder().decode(bytes),
      json: async <T = unknown>(): Promise<T> => {
        const text = new TextDecoder().decode(bytes);
        if (text.length === 0) {
          return undefined as T;
        }
        try {
          return JSON.parse(text) as T;
        } catch {
          throw HttpRequestError.Undecodable({
            method,
            url,
            status,
            headers,
            body: text,
          });
        }
      },
    },
  };
}
