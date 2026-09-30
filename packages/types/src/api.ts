export type PagedRecordResponse<T> = {
  status: "success";
  data: T[];
  pageInfo: {
    page: number;
    perPage: number;
    count: number;
    totalPages: number;
    hasMore: boolean;
    nextPageToken?: string;
  };
};

export type RecordResponse<T> = {
  status: "success";
  data: T;
};

export type ErrorResponse = {
  status: "error";
  message: string;
};
