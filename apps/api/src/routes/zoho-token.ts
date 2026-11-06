import { Router } from "express";
import { z } from "zod";
import { ApiPath } from "@repo/routing/api-path";
import { WebPath } from "@repo/routing/web-path";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import {
  ZohoAuthError,
  ZohoAuthErrorCode,
} from "@repo/node-utils/errors/zoho-auth-error";
import type {
  ZohoConnectionStatus,
  ZohoConsent,
  ZohoGrantCode,
} from "@repo/types/zoho-token";
import { HttpError } from "@repo/http-server/http-error";
import { initCatalystScopes, validateUserAuthentication } from "@repo/http-server/middleware";
import { RequestInput } from "@repo/http-server/request-input";
import { toRecordResponse } from "@repo/http-server/response";
import { env } from "@/env";
import { userZohoConnection } from "@/zoho-connections";

/** Failures the user fixes by starting consent again. Every other `ZohoAuthError` -
 *  `invalid_client`, the accounts server unreachable - is ours and stays a 500. */
const RESTART_CONSENT = new Set<string>([
  ZohoAuthErrorCode.StateMismatch,
  ZohoAuthErrorCode.InvalidGrantCode,
]);

function zohoScopes(): string[] {
  return env
    .get("ZOHO_TOKEN_SCOPES")
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope !== "");
}

/** What the callback page posts once Zoho sends the user back. */
const grantCodeSchema = z.object(
  {
    code: z.string({ error: "is required." }).trim().min(1, "is required."),
    state: z.string({ error: "is required." }).trim().min(1, "is required."),
  },
  { error: "Expected a JSON object." },
);

/** The web app's callback page, not a route here: Zoho sends the browser back to it, and
 *  only a call the web app makes carries the caller's bearer token. Zoho matches it exactly
 *  against the client's Authorized Redirect URI, so it is sent identically on consent and
 *  on the code exchange. */
function callbackUri(): string {
  return new URL(
    WebPath.ZohoToken + WebPath.Callback,
    env.get("ZOHO_TOKEN_CALLBACK_ORIGIN"),
  ).toString();
}

export const zohoTokenRouter: Router = Router();
// User for the caller and their grant row, Admin for Catalyst Cache and for deleting a
// grant Zoho rejected.
zohoTokenRouter.use(
  initCatalystScopes([CatalystScope.User, CatalystScope.Admin]),
  validateUserAuthentication,
);

// Answers the consent url rather than redirecting to it: a navigation carries no bearer
// token, so the web app fetches this and sends the browser there itself. A connected user
// gets a 409, so a second consent never mints another refresh token.
zohoTokenRouter.get(ApiPath.Connect, async (_req, res) => {
  if (await userZohoConnection.isConnected()) {
    throw HttpError.Conflict("Zoho is already connected.");
  }
  const consent: ZohoConsent = {
    consentUrl: await userZohoConnection.consentUrl(zohoScopes(), callbackUri()),
  };
  res.json(toRecordResponse(consent));
});

zohoTokenRouter.post(ApiPath.Callback, async (req, res) => {
  const grant: ZohoGrantCode = RequestInput.parse(grantCodeSchema, req.body);
  try {
    await userZohoConnection.persistToken(grant.code, grant.state, callbackUri());
  } catch (error) {
    if (error instanceof ZohoAuthError && RESTART_CONSENT.has(error.code)) {
      throw HttpError.BadRequest(
        "Zoho consent did not complete. Start the process again.",
      );
    }
    throw error;
  }
  const status: ZohoConnectionStatus = { connected: true };
  res.json(toRecordResponse(status));
});

zohoTokenRouter.get(ApiPath.Status, async (_req, res) => {
  const status: ZohoConnectionStatus = {
    connected: await userZohoConnection.isConnected(),
  };
  res.json(toRecordResponse(status));
});

zohoTokenRouter.post(ApiPath.Disconnect, async (_req, res) => {
  await userZohoConnection.disconnect();
  const status: ZohoConnectionStatus = { connected: false };
  res.json(toRecordResponse(status));
});
