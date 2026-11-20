import { CatalystError } from "@/catalyst-error";
import { Datastore } from "@zcatalyst/datastore";
import type { CatalystScope } from "@/catalyst-scope";
import { CatalystSession } from "@/catalyst-session";

/** One table's columns in a ZCQL result row. A query picks its own columns, so no table's
 *  row type describes them. */
export type ZcqlColumns = Record<string, unknown>;

/** A ZCQL result row as Catalyst sends it: each table's columns under that table's name, so
 *  a column two joined tables share - `ROWID` - is never lost to the other. */
export type ZcqlRow = Record<string, ZcqlColumns>;

/** A value bound to a `?` in a statement. `null` goes in as `NULL`. */
export type ZcqlValue = string | number | null;

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope.
 *
 *  Both statements run through `Datastore` rather than `@zcatalyst/zcql`: the latter is
 *  still at 0.0.2 and has no OLAP method, so one client covers both modes. */
function datastore(scope: CatalystScope): Datastore {
  return new Datastore(CatalystSession.app(scope));
}

/** ZCQL statements bound to a scope, acting for the request in flight. Reached only
 *  through `Zcql.runIn`. */
class ScopedZcql {
  constructor(
    private readonly scope: CatalystScope,
  ) {}

  /** Runs a ZCQL statement with each `?` replaced by the matching value. Each row keeps its
   *  columns under their table's name. */
  async executeQuery(statement: string, values: ZcqlValue[] = []): Promise<ZcqlRow[]> {
    const query = ScopedZcql.bind(statement, values);
    const datastoreClient = datastore(this.scope);
    try {
      const queryResult = await datastoreClient.executeZCQLQuery(query);
      return queryResult as ZcqlRow[];
    } catch (cause) {
      // Never the statement itself: it carries the bound values.
      throw CatalystError.InvalidResource("ZCQL query failed", cause);
    }
  }

  /** Same, in OLAP mode - the analytical engine, for aggregates over large scans. */
  async executeOlapQuery(statement: string, values: ZcqlValue[] = []): Promise<ZcqlRow[]> {
    const query = ScopedZcql.bind(statement, values);
    const datastoreClient = datastore(this.scope);
    try {
      const queryResult = await datastoreClient.executeOLAPQuery(query);
      return queryResult as ZcqlRow[];
    } catch (cause) {
      throw CatalystError.InvalidResource("ZCQL OLAP query failed", cause);
    }
  }

  /** ZCQL has no bound parameters, so this is where values meet the statement: every value
   *  goes in through a `?`, never written into the statement by the caller. */
  private static bind(statement: string, values: ZcqlValue[]): string {
    const parts = statement.split("?");
    if (parts.length - 1 !== values.length) {
      throw CatalystError.InvalidResource(
        `ZCQL statement has ${parts.length - 1} placeholders for ${values.length} values`,
      );
    }
    let query = parts[0] ?? "";
    values.forEach((value, i) => {
      query += ScopedZcql.literal(value) + (parts[i + 1] ?? "");
    });
    return query;
  }

  /** A value as a ZCQL literal. A string is wrapped in single quotes with each quote inside
   *  doubled - ZCQL's only escape; a backslash is an ordinary character, as checked against
   *  Catalyst. */
  private static literal(value: ZcqlValue): string {
    if (value === null) {
      return "NULL";
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw CatalystError.InvalidResource(`ZCQL value is not a finite number: ${value}`);
      }
      return String(value);
    }
    return `'${value.replaceAll("'", "''")}'`;
  }
}

export type { ScopedZcql };

/** ZCQL statements. A query joins across tables and belongs to no single one, so this
 *  names no resource and has no handle in `resources.ts`. */
export class Zcql {
  /** The ZCQL operations, acting with the current request's credentials for the scope. */
  static runIn(scope: CatalystScope): ScopedZcql {
    return new ScopedZcql(scope);
  }
}
