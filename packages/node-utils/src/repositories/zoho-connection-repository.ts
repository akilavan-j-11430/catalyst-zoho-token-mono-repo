import { CatalystScope } from "@/enums/catalyst-scope";
import { zohoConnectionTable } from "@/catalyst/resources";
import { Zcql } from "@/catalyst/zcql";

/**
 * Repository: every Data Store read and write of Zoho grants, and the only code naming the
 * `ZohoConnection` table's columns. One row per Catalyst user, keyed by `REFERENCE_ID`.
 *
 * The reads go through ZCQL rather than `Table.getRow`, which takes a ROWID and reports
 * every failure as a missing row - a datastore outage would then read as "not connected"
 * and mint a second grant.
 */
export class ZohoConnectionRepository {
  /** The stored refresh token, or undefined when the user has no grant. */
  static async findRefreshToken(
    referenceId: string,
    scope: CatalystScope,
  ): Promise<string | undefined> {
    const table = zohoConnectionTable;
    const rows = await Zcql.runIn(scope).executeQuery(
      `SELECT ${table.column("REFRESH_TOKEN")} FROM ${table.name} WHERE ${table.column("REFERENCE_ID")} = '${referenceId}' LIMIT 1`,
    );
    const refreshToken = rows[0]?.[table.name]?.[table.column("REFRESH_TOKEN")];
    return typeof refreshToken === "string" ? refreshToken : undefined;
  }

  /** Whether a grant is stored, without reading the token itself. */
  static async exists(
    referenceId: string,
    scope: CatalystScope,
  ): Promise<boolean> {
    const table = zohoConnectionTable;
    const rows = await Zcql.runIn(scope).executeQuery(
      `SELECT ${table.column("ROWID")} FROM ${table.name} WHERE ${table.column("REFERENCE_ID")} = '${referenceId}' LIMIT 1`,
    );
    return typeof rows[0]?.[table.name]?.[table.column("ROWID")] === "string";
  }

  /** Always User: the table's App User scope is USER, so only the row's creator can read
   *  it back, and the creator has to be the user it belongs to. */
  static async insert(referenceId: string, refreshToken: string): Promise<void> {
    await zohoConnectionTable.runIn(CatalystScope.User).insertRow({
      REFERENCE_ID: referenceId,
      REFRESH_TOKEN: refreshToken,
    });
  }

  /** Admin, because a rejected grant is also found by a job, which has no user. One
   *  statement by the column we already have, never a select of the ROWID first. */
  static async deleteByReferenceId(referenceId: string): Promise<void> {
    const table = zohoConnectionTable;
    await Zcql.runIn(CatalystScope.Admin).executeQuery(
      `DELETE FROM ${table.name} WHERE ${table.column("REFERENCE_ID")} = '${referenceId}'`,
    );
  }
}
