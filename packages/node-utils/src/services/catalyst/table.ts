import { ErrorCode } from "@/enums/error_codes";
import { CatalystError } from "@/errors/catalyst_error";
import { Datastore } from "@zcatalyst/datastore";
import { currentContext } from "@/framework/async_context";

type CatalystTable = ReturnType<Datastore["table"]>;

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope. */
function datastore(): Datastore {
  return new Datastore(currentContext().manager.catalyst);
}

export type TableRow = Record<string, unknown>;

/** A Catalyst Data Store table. */
export class Table {
  private constructor(private readonly name: string) {}

  private table(): CatalystTable {
    return datastore().table(this.name);
  }

  private async run<T>(operation: string, call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (cause) {
      throw new CatalystError(
        ErrorCode.INVALID_RESOURCE,
        `${operation} failed on ${this.name}`,
        cause,
      );
    }
  }

  /** Inserts one row and returns it with ROWID/CREATEDTIME populated. */
  insertRow(row: TableRow): Promise<TableRow> {
    return this.run("insertRow", () => this.table().insertRow(row));
  }

  /** Inserts multiple rows and returns them with ROWID/CREATEDTIME populated. */
  insertRows(rows: TableRow[]): Promise<TableRow[]> {
    return this.run("insertRows", () => this.table().insertRows(rows));
  }

  /** Fetches one row by ROWID; undefined when it does not exist. */
  async getRow(rowId: string): Promise<TableRow | undefined> {
    // ROWIDs are always numeric, so anything else cannot match a row and is not worth a call.
    if (!/^\d+$/.test(rowId)) {
      return undefined;
    }
    // Catalyst rejects for a missing row rather than resolving empty. Rather than probing
    // with a second query, treat a failed lookup as absent - a real datastore outage
    // surfaces on the next call rather than being reported as a phantom row.
    try {
      return await this.table().getRow(rowId);
    } catch {
      return undefined;
    }
  }

  /** Fetches one page of rows. maxRows defaults to the Catalyst default of 200. */
  async getPagedRows(
    options: { nextToken?: string; maxRows?: number } = {},
  ): Promise<{ rows: TableRow[]; nextToken?: string; hasMore: boolean }> {
    const page = await this.run("getPagedRows", () =>
      this.table().getPagedRows(options),
    );
    return {
      rows: page.data,
      nextToken: page.next_token,
      hasMore: page.more_records === true,
    };
  }

  /** Updates one row. The row must carry its ROWID. */
  updateRow(row: TableRow & { ROWID: string }): Promise<TableRow> {
    return this.run("updateRow", () => this.table().updateRow(row));
  }

  /** Updates multiple rows. Every row must carry its ROWID. */
  updateRows(rows: (TableRow & { ROWID: string })[]): Promise<TableRow[]> {
    return this.run("updateRows", () => this.table().updateRows(rows));
  }

  /** Deletes one row by ROWID. */
  async deleteRow(rowId: string): Promise<void> {
    await this.run("deleteRow", () => this.table().deleteRow(rowId));
  }

  /** Deletes multiple rows by ROWID. */
  async deleteRows(rowIds: string[]): Promise<void> {
    await this.run("deleteRows", () => this.table().deleteRows(rowIds));
  }

  /** Creates a handle to a named table. */
  static create(name: string): Table {
    return new Table(name);
  }
}
