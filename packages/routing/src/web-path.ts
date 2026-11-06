/**
 * Every segment of an `apps/web` page path that another app has to name. `apps/api` hands
 * the Zoho consent callback page to Zoho as the redirect uri, so it lives here rather than
 * as a literal in the api.
 */
export const WebPath = {
  ZohoToken: "/zoho-token",
  Callback: "/callback",
} as const;

export type WebPath = (typeof WebPath)[keyof typeof WebPath];
