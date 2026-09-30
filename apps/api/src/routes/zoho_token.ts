import { Router } from "express";
import {
  ZohoAuthCode,
  ZohoAuthError,
} from "@repo/node-utils/errors/zoho_auth_error";
import { UserManagement } from "@repo/node-utils/services/catalyst/user_management";
import { ZohoAccounts } from "@repo/node-utils/services/zoho/accounts";
import { ZohoConnection } from "@repo/node-utils/services/zoho/connection";
import { env } from "@/env";
import { HttpError } from "@/errors/http_error";
import { toRecordResponse } from "@/utils/api";

/** Zoho's own code for a grant code that is expired, already used, or simply wrong. */
const INVALID_GRANT_CODE = "invalid_code";

function zohoAccounts(): ZohoAccounts {
  return ZohoAccounts.create({
    accountsUrl: env.get("ZOHO_ACCOUNTS_URL"),
    clientId: env.get("ZOHO_CLIENT_ID"),
    clientSecret: env.get("ZOHO_CLIENT_SECRET"),
  });
}

function zohoScopes(): string[] {
  return env
    .get("ZOHO_SCOPES")
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope !== "");
}

async function callerConnection(
  accounts: ZohoAccounts,
): Promise<ZohoConnection> {
  const caller = await UserManagement.currentUser();
  return ZohoConnection.create(caller.userId, accounts);
}

function requiredQuery(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw HttpError.BadRequest(`${name} is required.`);
  }
  return value;
}

/** A caller with no grant stored is a `false`, not a failure. Anything else - Zoho down,
 *  a revoked token - is a real error and belongs in `errorHandler` as a 500. */
async function hasUsableToken(connection: ZohoConnection): Promise<boolean> {
  try {
    await connection.accessToken();
    return true;
  } catch (error) {
    if (
      error instanceof ZohoAuthError &&
      error.code === ZohoAuthCode.NotConnected
    ) {
      return false;
    }
    throw error;
  }
}

export const zohoTokenRouter: Router = Router();

zohoTokenRouter.get("/zoho-token/connect", async (_req, res) => {
  const accounts = zohoAccounts();
  const connection = await callerConnection(accounts);
  if (await connection.isConnected()) {
    res.json(toRecordResponse({ connected: true }));
    return;
  }
  const state = await connection.issueState();
  res.redirect(
    accounts.consentUrl(zohoScopes(), env.get("ZOHO_REDIRECT_URI"), state),
  );
});

zohoTokenRouter.get("/zoho-token/callback", async (req, res) => {
  const code = requiredQuery(req.query["code"], "code");
  const state = requiredQuery(req.query["state"], "state");
  const connection = await callerConnection(zohoAccounts());
  if (!(await connection.verifyState(state))) {
    throw HttpError.BadRequest(
      "state does not match the consent request. Start again at /api/zoho-token/connect.",
    );
  }
  try {
    await connection.connect(code, env.get("ZOHO_REDIRECT_URI"));
  } catch (error) {
    if (error instanceof ZohoAuthError && error.code === INVALID_GRANT_CODE) {
      throw HttpError.BadRequest(
        "Zoho refused the grant code. Start again at /api/zoho-token/connect.",
      );
    }
    throw error;
  }
  res.json(toRecordResponse({ connected: true }));
});

zohoTokenRouter.get("/zoho-token/status", async (_req, res) => {
  const connection = await callerConnection(zohoAccounts());
  res.json(toRecordResponse({ connected: await hasUsableToken(connection) }));
});
