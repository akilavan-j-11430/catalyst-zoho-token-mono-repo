"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { InputValidation } from "@repo/input-validation/input-validation";
import { InvalidInputError } from "@repo/input-validation/invalid-input-error";
import { ZohoAuthError, ZohoAuthErrorCode } from "@repo/zoho-token/zoho-auth-error";
import { withCatalystFn } from "@/execution-context";
import { RequestUrl } from "@/request-url";
import { WebPath } from "@/web-path";
import { ZohoConnections } from "@/zoho-connections";

/** What Zoho hands the callback page after consent. */
export interface ZohoGrantCode {
  code: string;
  state: string;
}

export type CompleteConsentResult = { ok: true } | { ok: false; problem: string };

const grantCodeSchema = z.object(
  {
    code: z.string({ error: "is required." }).trim().min(1, "is required."),
    state: z.string({ error: "is required." }).trim().min(1, "is required."),
  },
  { error: "Expected a JSON object." },
);

/** Failures the user fixes by starting consent again. Every other `ZohoAuthError` -
 *  `invalid_client`, the accounts server unreachable - is ours and is thrown. */
const RESTART_CONSENT = new Set<string>([
  ZohoAuthErrorCode.StateMismatch,
  ZohoAuthErrorCode.InvalidGrantCode,
]);

/**
 * Stores the grant Zoho sent the callback page for the signed-in user. The redirect uri is
 * sent exactly as it was on consent, since Zoho matches the two. User for the caller and their
 * grant row, Admin for Catalyst Cache.
 */
export const completeZohoConsent = withCatalystFn(
  [CatalystScope.User, CatalystScope.Admin],
  async (input: unknown): Promise<CompleteConsentResult> => {
    try {
      const grant: ZohoGrantCode = InputValidation.parse(grantCodeSchema, input);
      await ZohoConnections.user().persistToken(
        grant.code,
        grant.state,
        await RequestUrl.absolute(WebPath.ZohoTokenCallback),
      );
      revalidatePath(WebPath.Home);
      return { ok: true };
    } catch (error) {
      const mustRestart =
        error instanceof InvalidInputError ||
        (error instanceof ZohoAuthError && RESTART_CONSENT.has(error.code));
      if (mustRestart) {
        return { ok: false, problem: "Zoho consent did not complete. Connect again to retry." };
      }
      throw error;
    }
  },
);
