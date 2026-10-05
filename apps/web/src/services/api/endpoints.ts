import { ApiPath } from "@repo/routing/api-path";

/**
 * Every path this app calls, in one place, each relative to the client's `baseUrl` the
 * way the server's `HttpClient` takes them. A route moves and this file is the only edit.
 */
export const endpoint = {
  auth: {
    register: ApiPath.Auth + ApiPath.Register,
  },
  zohoToken: {
    connect: ApiPath.ZohoToken + ApiPath.Connect,
    status: ApiPath.ZohoToken + ApiPath.Status,
    disconnect: ApiPath.ZohoToken + ApiPath.Disconnect,
  },
} as const;
