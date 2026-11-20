import "server-only";
import { defineEnv } from "@repo/env/define-env";

/**
 * Every environment variable this app's server code reads. Requiredness is expressed at the
 * call site - `env.get` for one that must be set, `env.optional` for one with a fallback - so
 * a key appears here exactly once either way. The browser reads none of these.
 */
type WebEnv = {
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
};

export const env = defineEnv<WebEnv>();
