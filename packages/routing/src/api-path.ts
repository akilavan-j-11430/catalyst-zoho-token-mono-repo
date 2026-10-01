/**
 * Every segment of every API path, declared once and shared by `apps/api`, which mounts
 * them, and `apps/web`, which calls them. A full path is the segments added together, so a route
 * moves by editing one value here.
 */
export const ApiPath = {
  Api: "/api",
  V1: "/v1",
  Ping: "/ping",
  Auth: "/auth",
  Register: "/register",
  ZohoToken: "/zoho-token",
  Connect: "/connect",
  Callback: "/callback",
  Status: "/status",
} as const;

export type ApiPath = (typeof ApiPath)[keyof typeof ApiPath];
