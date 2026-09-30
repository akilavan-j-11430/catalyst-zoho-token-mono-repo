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
};

export const env = defineEnv<ApiEnv>();
