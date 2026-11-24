import { Cache } from "@/cache";
import { Table } from "@/table";

/** One Zoho grant per Catalyst user. */
export interface ZohoConnectionRow {
  REFERENCE_ID: string;
  REFRESH_TOKEN: string;
}

/** The Zoho refresh token, one row per Catalyst user. */
export const zohoConnectionTable = Table.create<ZohoConnectionRow>("ZohoConnection");

/** The project's default segment. Holds the minted Zoho access tokens. */
export const zohoConnectionCache = Cache.create();
