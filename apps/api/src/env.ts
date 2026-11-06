import { defineEnv } from "@repo/node-utils/utils/env";

/**
 * Every environment variable this app reads. Requiredness is expressed at the
 * call site - `env.get` for one that must be set, `env.optional` for one with a
 * fallback - so a key appears here exactly once either way.
 */
type ApiEnv = {
  /** Where Catalyst sends a new user from the confirmation email. */
  AUTH_REDIRECT_URL: string;
  /** Timezone for log timestamps. Falls back to the logger's own default. */
  TZ: string;
  /** Zoho OAuth client id, from a Server-based client at api-console.zoho.com. */
  ZOHO_TOKEN_CLIENT_ID: string;
  /** Its secret. Lives in .env and in the Catalyst Console, never in a committed file. */
  ZOHO_TOKEN_CLIENT_SECRET: string;
  /** Comma-separated scopes the consent screen asks for. */
  ZOHO_TOKEN_SCOPES: string;
  /** The accounts server for the DC, scheme and all - https://accounts.zoho.in */
  ZOHO_TOKEN_ACCOUNTS_URL: string;
  /** The web app's origin, scheme and all - http://localhost:3001, or the Slate domain in
   *  the cloud. Zoho sends the browser back to its /zoho-token/callback page, and that full
   *  url must equal the client's Authorized Redirect URI. */
  ZOHO_TOKEN_CALLBACK_ORIGIN: string;
};

export const env = defineEnv<ApiEnv>();
