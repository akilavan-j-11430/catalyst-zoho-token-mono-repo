import { Router } from "express";
import { ApiPath } from "@repo/routing/api-path";
import {
  ZohoAuthError,
  ZohoAuthErrorCode,
} from "@repo/node-utils/errors/zoho-auth-error";
import { ZohoConnection } from "@repo/node-utils/services/zoho/connection";
import { env } from "@/env";
import { HttpError } from "@/errors/http-error";
import { toRecordResponse } from "@/utils/api";
import { validateUserAuthentication } from "@/middleware";

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

function requiredQuery(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw HttpError.BadRequest(`${name} is required.`);
  }
  return value;
}

/** Zoho matches it exactly against the client's Authorized Redirect URI, so it is sent
 *  identically on consent and on the code exchange. */
function callbackUri(): string {
  return new URL(
    ApiPath.Api + ApiPath.V1 + ApiPath.ZohoToken + ApiPath.Callback,
    env.get("ZOHO_TOKEN_CALLBACK_ORIGIN"),
  ).toString();
}

/** Where the browser lands once the connection exists - the web app's home page. */
function webAppHome(): string {
  return new URL("/", env.get("WEB_APP_ORIGIN")).toString();
}

export const zohoTokenRouter: Router = Router();
zohoTokenRouter.use(validateUserAuthentication)

zohoTokenRouter.get(ApiPath.Connect, async (_req, res) => {
  if (await ZohoConnection.isConnected()) {
    res.redirect(webAppHome());
    return;
  }
  res.redirect(await ZohoConnection.consentUrl(zohoScopes(), callbackUri()));
});

zohoTokenRouter.get(ApiPath.Callback, async (req, res) => {
  const code = requiredQuery(req.query["code"], "code");
  const state = requiredQuery(req.query["state"], "state");
  try {
    await ZohoConnection.persistToken(code, state, callbackUri());
  } catch (error) {
    if (error instanceof ZohoAuthError && RESTART_CONSENT.has(error.code)) {
      throw HttpError.BadRequest(
        "Zoho consent did not complete. Start the process again.",
      );
    }
    throw error;
  }
  res.redirect(webAppHome());
});

zohoTokenRouter.get(ApiPath.Status, async (_req, res) => {
  res.json(
    toRecordResponse({ connected: await ZohoConnection.isConnected() }),
  );
});
