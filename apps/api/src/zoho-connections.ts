import {
  currentUserGrant,
  ZohoConnection,
} from "@repo/node-utils/services/zoho/connection";
import { env } from "@/env";

export const userZohoConnection = ZohoConnection.create(
  {
    accountsUrl: env.get("ZOHO_TOKEN_ACCOUNTS_URL"),
    clientId: env.get("ZOHO_TOKEN_CLIENT_ID"),
    clientSecret: env.get("ZOHO_TOKEN_CLIENT_SECRET"),
  },
  currentUserGrant,
);
