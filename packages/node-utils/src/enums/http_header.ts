/** Header names worth spelling once. See `HttpMethod` for why this is not a TS enum. */
export const HttpHeader = {
  ContentType: "content-type",
  Authorization: "authorization",
  Accept: "accept",
  /** Correlates an outbound call with the request that caused it. */
  AppExecutionId: "app-execution-id",
} as const;

export type HttpHeader = (typeof HttpHeader)[keyof typeof HttpHeader];
