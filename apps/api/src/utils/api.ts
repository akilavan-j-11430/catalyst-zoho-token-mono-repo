import type {
  ErrorResponse,
  PagedRecordResponse,
  RecordResponse,
} from "@repo/types/api";
import type { Request } from "express";
import { env } from "@/env";
import { HttpError } from "@/errors/http-error";

export function toPagedResponse<T>(
  data: T[],
  page: number,
  perPage: number,
  count: number,
  nextPageToken?: string,
): PagedRecordResponse<T> {
  return {
    data,
    status: "success",
    pageInfo: {
      page,
      perPage,
      count,
      // At least one page, so a client can render "page 1 of 1" for an empty result.
      totalPages: Math.max(Math.ceil(count / perPage), 1),
      hasMore: page * perPage < count,
      nextPageToken,
    },
  };
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Where the browser reached this app: `WEB_ORIGIN` when set, else the request's `Host`
 *  header. Either may be a bare domain or carry a scheme. A given scheme is kept; without
 *  one, https is assumed - Catalyst forwards no scheme and serves every deployed domain
 *  over https - except on a local host, which is plain http. */
function appUrl(req: Request): URL {
  const value = env.optional("WEB_ORIGIN") ?? req.get("host");
  if (value === undefined) {
    throw HttpError.BadRequest("The request carries no Host header.");
  }
  if (value.includes("://")) {
    return new URL(value);
  }
  const url = new URL(`https://${value}`);
  if (LOCAL_HOSTNAMES.has(url.hostname)) {
    url.protocol = "http:";
  }
  return url;
}

/** The domain the browser reached this app on, port included and no scheme. */
export function getDomain(req: Request): string {
  return appUrl(req).host;
}

/** `getDomain` with its scheme. */
export function getOrigin(req: Request): string {
  return appUrl(req).origin;
}

export function toRecordResponse<T>(data: T): RecordResponse<T> {
  return { data, status: "success" };
}

export function toErrorResponse(message: string): ErrorResponse {
  return { status: "error", message };
}
