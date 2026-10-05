import { Router } from "express";
import { ApiPath } from "@repo/routing/api-path";
import {
  ZohoAuthError,
  ZohoAuthErrorCode,
} from "@repo/node-utils/errors/zoho-auth-error";
import { logger } from "@repo/node-utils/framework/logger";
import { env } from "@/env";
import { HttpError } from "@/errors/http-error";
import { toRecordResponse } from "@/utils/api";
import { validateUserAuthentication } from "@/middleware";
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
  if (await userZohoConnection.isConnected()) {
    res.redirect(webAppHome());
    return;
  }
  res.redirect(await userZohoConnection.consentUrl(zohoScopes(), callbackUri()));
});

zohoTokenRouter.get(ApiPath.Callback, async (req, res) => {
  // Zoho sends `error` instead of a code when the user denies consent. Nothing is
  // stored, so the browser goes home and the user can start again from there.
  const denied = req.query["error"];
  if (denied !== undefined) {
    logger.info(`Zoho consent was not granted: ${String(denied)}`);
    res.redirect(webAppHome());
    return;
  }
  const code = requiredQuery(req.query["code"], "code");
  const state = requiredQuery(req.query["state"], "state");
  try {
    await userZohoConnection.persistToken(code, state, callbackUri());
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
    toRecordResponse({ connected: await userZohoConnection.isConnected() }),
  );
});

zohoTokenRouter.post(ApiPath.Disconnect, async (_req, res) => {
  await userZohoConnection.disconnect();
  res.json(toRecordResponse({ connected: false }));
});
