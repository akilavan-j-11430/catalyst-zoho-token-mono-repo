import type {
  ErrorResponse,
  PagedRecordResponse,
  RecordResponse,
} from "@repo/types/api";

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

export function toRecordResponse<T>(data: T): RecordResponse<T> {
  return { data,status: "success" };
}

export function toErrorResponse(message: string): ErrorResponse {
  return { status: "error", message };
}

