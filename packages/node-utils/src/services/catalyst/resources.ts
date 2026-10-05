import { Cache } from "@/services/catalyst/cache";
import { Table } from "@/services/catalyst/table";

/** The Zoho refresh token, one row per Catalyst user. */
export const zohoConnectionTable = Table.create<{
  REFERENCE_ID: string;
  REFRESH_TOKEN: string;
}>("ZohoConnection");

/** The project's default segment. Holds the minted Zoho access tokens. */
export const zohoConnectionCache = Cache.create();
