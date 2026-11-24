import "server-only";
import { currentUserGrant, ZohoConnection } from "@repo/zoho-token/zoho-connection";
import { env } from "@/env";

/** This app's one Zoho connection, declared here and nowhere else (`zoho-token.md`). */
export class ZohoConnections {
  private static signedInUser: ZohoConnection | undefined;

  /** The signed-in user's grant. Built on first use rather than at import: `next build`
   *  loads every page module, and it has no Zoho keys to read. */
  static user(): ZohoConnection {
    ZohoConnections.signedInUser ??= ZohoConnection.create(
      {
        accountsUrl: env.get("ZOHO_TOKEN_ACCOUNTS_URL"),
        clientId: env.get("ZOHO_TOKEN_CLIENT_ID"),
        clientSecret: env.get("ZOHO_TOKEN_CLIENT_SECRET"),
      },
      currentUserGrant,
    );
    return ZohoConnections.signedInUser;
  }
}
