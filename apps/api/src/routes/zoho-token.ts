import { Router } from "express";
import {
  ZohoAuthError,
  ZohoAuthErrorCode,
} from "@repo/node-utils/errors/zoho-auth-error";
import { ZohoConnection } from "@repo/node-utils/services/zoho/connection";
import { env } from "@/env";
import { HttpError } from "@/errors/http-error";
import { toRecordResponse } from "@/utils/api";

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

/** A caller with no grant stored is a `false`, not a failure. Anything else - Zoho down,
 *  a revoked token - is a real error and belongs in `errorHandler` as a 500. */
async function hasUsableToken(): Promise<boolean> {
  try {
    await ZohoConnection.getToken();
    return true;
  } catch (error) {
    if (
      error instanceof ZohoAuthError &&
      error.code === ZohoAuthErrorCode.NotConnected
    ) {
      return false;
    }
    throw error;
  }
}

export const zohoTokenRouter: Router = Router();

zohoTokenRouter.get("/zoho-token/connect", async (_req, res) => {
  if (await ZohoConnection.hasToken()) {
    res.json(toRecordResponse({ connected: true }));
    return;
  }
  res.redirect(
    await ZohoConnection.consentUrl(zohoScopes(), env.get("ZOHO_REDIRECT_URI")),
  );
});

zohoTokenRouter.get("/zoho-token/callback", async (req, res) => {
  const code = requiredQuery(req.query["code"], "code");
  const state = requiredQuery(req.query["state"], "state");
  try {
    await ZohoConnection.persistToken(
      code,
      state,
      env.get("ZOHO_REDIRECT_URI"),
    );
  } catch (error) {
    if (error instanceof ZohoAuthError && RESTART_CONSENT.has(error.code)) {
      throw HttpError.BadRequest(
        "Zoho consent did not complete. Start the process again.",
      );
    }
    throw error;
  }
  res.json(toRecordResponse({ connected: true }));
});

zohoTokenRouter.get("/zoho-token/status", async (_req, res) => {
  res.json(toRecordResponse({ connected: await hasUsableToken() }));
});
