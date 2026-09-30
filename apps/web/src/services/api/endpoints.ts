/**
 * Every path this app calls, in one place, each relative to the client's `baseUrl` the
 * way the server's `HttpClient` takes them. A route moves and this file is the only edit.
 */
export const endpoint = {
  auth: {
    register: "/auth/register",
  },
} as const;
