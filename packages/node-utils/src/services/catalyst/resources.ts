import { Cache } from "@/services/catalyst/cache";
import { Table } from "@/services/catalyst/table";

/** The Zoho refresh token, one row per Catalyst user. */
export const zohoConnectionTable = Table.create<{
  REFERENCE_ID: string;
  REFRESH_TOKEN: string;
}>("ZohoConnection");

/** The project's default segment. Holds both the minted access tokens and the short-lived
 *  OAuth state values, told apart by their key prefix - one Catalyst resource, one handle. */
export const zohoConnectionCache = Cache.create();
