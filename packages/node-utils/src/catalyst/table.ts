import { CatalystError } from "@/errors/catalyst-error";
import { Datastore } from "@zcatalyst/datastore";
import type { CatalystScope } from "@/enums/catalyst-scope";
import { currentContext } from "@/framework/async-context";

type CatalystTable = ReturnType<Datastore["table"]>;
type SdkRowInput = Parameters<CatalystTable["insertRow"]>[0];
type SdkRowUpdate = Parameters<CatalystTable["updateRow"]>[0];
type SdkRowPage = Awaited<ReturnType<CatalystTable["getPagedRows"]>>;

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope. */
function datastore(scope: CatalystScope): Datastore {
  return new Datastore(currentContext().manager.catalyst.getApp(scope));
}

/** Columns Catalyst adds to every table and returns on every read and write. */
export interface SystemColumns {
  ROWID: string;
  CREATORID: string;
  CREATEDTIME: string;
  MODIFIEDTIME: string;
}

/** What a read, insert or update returns: every declared column, with unset optional
 *  columns as null - Catalyst returns them as null rather than leaving the key out. */
export type StoredRow<Row> = SystemColumns & {
  [K in keyof Row]-?: undefined extends Row[K]
    ? Exclude<Row[K], undefined> | null
    : Row[K];
};

/** An update: any subset of the declared columns, plus the ROWID it targets. */
export type RowUpdate<Row> = Partial<Row> & Pick<SystemColumns, "ROWID">;

/** A column a ZCQL statement may name: a declared one or a system one. */
export type ColumnName<Row> = Extract<keyof Row | keyof SystemColumns, string>;

/** A Data Store table bound to a scope. Reached only through `Table.runIn`. Each method
 *  casts the SDK's untyped rows to this table's declared row. */
class ScopedTable<Row extends object> {
  constructor(
    private readonly name: string,
    private readonly scope: CatalystScope,
  ) {}

  private table(): CatalystTable {
    return datastore(this.scope).table(this.name);
  }

  /** Inserts one row and returns it with ROWID/CREATEDTIME populated. */
  async insertRow(row: Row): Promise<StoredRow<Row>> {
    try {
      const storedRow = await this.table().insertRow(row as SdkRowInput);
      return storedRow as unknown as StoredRow<Row>;
    } catch (cause) {
      throw CatalystError.InvalidResource(`insertRow failed on ${this.name}`, cause);
    }
  }

  /** Inserts multiple rows and returns them with ROWID/CREATEDTIME populated. */
  async insertRows(rows: Row[]): Promise<StoredRow<Row>[]> {
    try {
      const storedRows = await this.table().insertRows(rows as SdkRowInput[]);
      return storedRows as unknown as StoredRow<Row>[];
    } catch (cause) {
      throw CatalystError.InvalidResource(`insertRows failed on ${this.name}`, cause);
    }
  }

  /** Fetches one row by ROWID; undefined when it does not exist. */
  async getRow(rowId: string): Promise<StoredRow<Row> | undefined> {
    // ROWIDs are always numeric, so anything else cannot match a row and is not worth a call.
    if (!/^\d+$/.test(rowId)) {
      return undefined;
    }
    // Catalyst rejects for a missing row rather than resolving empty. Rather than probing
    // with a second query, treat a failed lookup as absent - a real datastore outage
    // surfaces on the next call rather than being reported as a phantom row.
    try {
      return (await this.table().getRow(rowId)) as unknown as StoredRow<Row>;
    } catch {
      return undefined;
    }
  }

  /** Fetches one page of rows. maxRows defaults to the Catalyst default of 200. */
  async getPagedRows(
    options: { nextToken?: string; maxRows?: number } = {},
  ): Promise<{ rows: StoredRow<Row>[]; nextToken?: string; hasMore: boolean }> {
    try {
      const page: SdkRowPage = await this.table().getPagedRows(options);
      return {
        rows: page.data as unknown as StoredRow<Row>[],
        nextToken: page.next_token,
        hasMore: page.more_records === true,
      };
    } catch (cause) {
      throw CatalystError.InvalidResource(`getPagedRows failed on ${this.name}`, cause);
    }
  }

  /** Updates one row. The row must carry its ROWID. */
  async updateRow(row: RowUpdate<Row>): Promise<StoredRow<Row>> {
    try {
      const storedRow = await this.table().updateRow(row as SdkRowUpdate);
      return storedRow as unknown as StoredRow<Row>;
    } catch (cause) {
      throw CatalystError.InvalidResource(`updateRow failed on ${this.name}`, cause);
    }
  }

  /** Updates multiple rows. Every row must carry its ROWID. */
  async updateRows(rows: RowUpdate<Row>[]): Promise<StoredRow<Row>[]> {
    try {
      const storedRows = await this.table().updateRows(rows as SdkRowUpdate[]);
      return storedRows as unknown as StoredRow<Row>[];
    } catch (cause) {
      throw CatalystError.InvalidResource(`updateRows failed on ${this.name}`, cause);
    }
  }

  /** Deletes one row by ROWID. */
  async deleteRow(rowId: string): Promise<void> {
    try {
      await this.table().deleteRow(rowId);
    } catch (cause) {
      throw CatalystError.InvalidResource(`deleteRow failed on ${this.name}`, cause);
    }
  }

  /** Deletes multiple rows by ROWID. */
  async deleteRows(rowIds: string[]): Promise<void> {
    try {
      await this.table().deleteRows(rowIds);
    } catch (cause) {
      throw CatalystError.InvalidResource(`deleteRows failed on ${this.name}`, cause);
    }
  }
}

export type { ScopedTable };

/** A Catalyst Data Store table. Holds the name only; every operation goes through `runIn`.
 *  `Row` declares the table's columns: a non-optional property is a mandatory column. */
export class Table<Row extends object> {
  private constructor(readonly name: string) {}

  /** The table's operations, acting with the scope's credentials. */
  runIn(scope: CatalystScope): ScopedTable<Row> {
    return new ScopedTable<Row>(this.name, scope);
  }

  /** A column name for a ZCQL statement - `REFERENCE_ID`. */
  column(name: ColumnName<Row>): string {
    return name;
  }

  /** A column name qualified by this table - `ZohoConnection.REFERENCE_ID`. */
  qualifiedColumn(name: ColumnName<Row>): string {
    return `${this.name}.${name}`;
  }

  /** Creates a handle to a named table. `never` by default, so a handle declared without
   *  its row type accepts no row at all rather than any row. */
  static create<Row extends object = never>(name: string): Table<Row> {
    return new Table<Row>(name);
  }
}
