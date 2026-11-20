import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { Zcql } from "@repo/catalyst-node/zcql";
import { zohoConnectionTable } from "@/resources";

/**
 * Repository: every Data Store read and write of Zoho grants, and the only code naming the
 * `ZohoConnection` table's columns. One row per Catalyst user, keyed by `REFERENCE_ID`.
 *
 * The reads go through ZCQL rather than `Table.getRow`, which takes a ROWID - and the user's
 * id is all a caller has.
 */
export class ZohoConnectionRepository {
  /** The signed-in user's own refresh token, or undefined when they have no grant. User, so
   *  the table's USER scope lets them read only the row their own credentials created. */
  static async findRefreshToken(referenceId: string): Promise<string | undefined> {
    return ZohoConnectionRepository.selectRefreshToken(referenceId, CatalystScope.User);
  }

  /** A named user's refresh token, for a job acting for them with no one signed in. Admin,
   *  so the id must be the job's own, never one a request supplied. */
  static async findRefreshTokenForJob(referenceId: string): Promise<string | undefined> {
    return ZohoConnectionRepository.selectRefreshToken(referenceId, CatalystScope.Admin);
  }

  /** Whether the signed-in user has a grant stored, without reading the token itself. */
  static async exists(referenceId: string): Promise<boolean> {
    const table = zohoConnectionTable;
    const rows = await Zcql.runIn(CatalystScope.User).executeQuery(
      `SELECT ${table.column("ROWID")} FROM ${table.name} WHERE ${table.column("REFERENCE_ID")} = ? LIMIT 1`,
      [referenceId],
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

  /** Admin, because a grant Zoho rejected is also found by a job, which has no user. One
   *  statement by the column we already have, never a select of the ROWID first. */
  static async deleteByReferenceId(referenceId: string): Promise<void> {
    const table = zohoConnectionTable;
    await Zcql.runIn(CatalystScope.Admin).executeQuery(
      `DELETE FROM ${table.name} WHERE ${table.column("REFERENCE_ID")} = ?`,
      [referenceId],
    );
  }

  private static async selectRefreshToken(
    referenceId: string,
    scope: CatalystScope,
  ): Promise<string | undefined> {
    const table = zohoConnectionTable;
    const rows = await Zcql.runIn(scope).executeQuery(
      `SELECT ${table.column("REFRESH_TOKEN")} FROM ${table.name} WHERE ${table.column("REFERENCE_ID")} = ? LIMIT 1`,
      [referenceId],
    );
    const refreshToken = rows[0]?.[table.name]?.[table.column("REFRESH_TOKEN")];
    return typeof refreshToken === "string" ? refreshToken : undefined;
  }
}
