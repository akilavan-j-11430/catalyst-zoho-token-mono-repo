import { type Request, Router } from "express";
import {
  ZohoAuthError,
  ZohoAuthErrorCode,
} from "@repo/node-utils/errors/zoho-auth-error";
import { ZohoConnection } from "@repo/node-utils/services/zoho/connection";
import { env } from "@/env";
import { HttpError } from "@/errors/http-error";
import { getOrigin, toRecordResponse } from "@/utils/api";
import { requireSignedInUser } from "@/middleware";

/** Failures the user fixes by starting consent again. Every other `ZohoAuthError` -
 *  `invalid_client`, the accounts server unreachable - is ours and stays a 500. */
const RESTART_CONSENT = new Set<string>([
  ZohoAuthErrorCode.StateMismatch,
  ZohoAuthErrorCode.InvalidGrantCode,
]);

function zohoScopes(): string[] {
  return env
    .get("ZOHO_SCOPES")
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope !== "");
}

function requiredQuery(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw HttpError.BadRequest(`${name} is required.`);
  }
  return value;
}

/** Zoho matches it exactly against the client's Authorized Redirect URI, so it is sent
 *  identically on consent and on the code exchange. */
function callbackUri(req: Request): string {
  return new URL("/api/zoho-token/callback", getOrigin(req)).toString();
}

/** Where the browser lands once the connection exists. */
const APP_HOME = "/";

export const zohoTokenRouter: Router = Router();
zohoTokenRouter.use(requireSignedInUser)

zohoTokenRouter.get("/zoho-token/connect", async (req, res) => {
  if (await ZohoConnection.isConnected()) {
    res.redirect(APP_HOME);
    return;
  }
  res.redirect(await ZohoConnection.consentUrl(zohoScopes(), callbackUri(req)));
});

zohoTokenRouter.get("/zoho-token/callback", async (req, res) => {
  const code = requiredQuery(req.query["code"], "code");
  const state = requiredQuery(req.query["state"], "state");
  try {
    await ZohoConnection.persistToken(code, state, callbackUri(req));
  } catch (error) {
    if (error instanceof ZohoAuthError && RESTART_CONSENT.has(error.code)) {
      throw HttpError.BadRequest(
        "Zoho consent did not complete. Start the process again.",
      );
    }
    throw error;
  }
  res.redirect(APP_HOME);
});

zohoTokenRouter.get("/zoho-token/status", async (_req, res) => {
  res.json(
    toRecordResponse({ connected: await ZohoConnection.isConnected() }),
  );
});
