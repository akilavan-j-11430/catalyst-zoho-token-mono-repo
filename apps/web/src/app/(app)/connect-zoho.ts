"use server";

import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { env } from "@/env";
import { withCatalystFn } from "@/execution-context";
import { RequestUrl } from "@/request-url";
import { WebPath } from "@/web-path";
import { ZohoConnections } from "@/zoho-connections";

export type ConnectResult = { ok: true; consentUrl: string } | { ok: false; problem: string };

function consentScopes(): string[] {
  return env
    .get("ZOHO_TOKEN_SCOPES")
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope !== "");
}

/**
 * Where to send the browser for Zoho's consent screen. A connected user is turned away, so a
 * second consent never mints another refresh token. User for the caller and their grant row,
 * Admin for Catalyst Cache.
 */
export const connectZoho = withCatalystFn(
  [CatalystScope.User, CatalystScope.Admin],
  async (): Promise<ConnectResult> => {
    const connection = ZohoConnections.user();
    if (await connection.isConnected()) {
      return { ok: false, problem: "Zoho is already connected." };
    }
    const consentUrl = await connection.consentUrl(
      consentScopes(),
      await RequestUrl.absolute(WebPath.ZohoTokenCallback),
    );
    return { ok: true, consentUrl };
  },
);
