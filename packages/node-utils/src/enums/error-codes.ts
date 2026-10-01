/** Why an operation failed, independent of how any caller renders it. */
export const ErrorCode = {
  INVALID_RESOURCE: "INVALID_RESOURCE",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
