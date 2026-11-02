import { CatalystError } from "@/errors/catalyst-error";
import { Datastore } from "@zcatalyst/datastore";
import type { CatalystScope } from "@/enums/catalyst-scope";
import { currentContext } from "@/framework/async-context";

/** One table's columns in a ZCQL result row. A query picks its own columns, so no table's
 *  row type describes them. */
export type ZcqlColumns = Record<string, unknown>;

/** A ZCQL result row as Catalyst sends it: each table's columns under that table's name, so
 *  a column two joined tables share - `ROWID` - is never lost to the other. */
export type ZcqlRow = Record<string, ZcqlColumns>;

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope.
 *
 *  Both statements run through `Datastore` rather than `@zcatalyst/zcql`: the latter is
 *  still at 0.0.2 and has no OLAP method, so one client covers both modes. */
function datastore(scope: CatalystScope): Datastore {
  return new Datastore(currentContext().manager.catalyst.getApp(scope));
}

/** ZCQL statements bound to a scope. Reached only through `Zcql.runIn`. */
class ScopedZcql {
  constructor(private readonly scope: CatalystScope) {}

  /** Runs a ZCQL statement. Each row keeps its columns under their table's name. */
  async executeQuery(query: string): Promise<ZcqlRow[]> {
    try {
      const queryResult = await datastore(this.scope).executeZCQLQuery(query);
      return queryResult as ZcqlRow[];
    } catch (cause) {
      throw CatalystError.InvalidResource(`query failed: ${query}`, cause);
    }
  }

  /** Same, in OLAP mode - the analytical engine, for aggregates over large scans. */
  async executeOlapQuery(query: string): Promise<ZcqlRow[]> {
    try {
      const queryResult = await datastore(this.scope).executeOLAPQuery(query);
      return queryResult as ZcqlRow[];
    } catch (cause) {
      throw CatalystError.InvalidResource(`olap query failed: ${query}`, cause);
    }
  }
}

export type { ScopedZcql };

/** ZCQL statements. A query joins across tables and belongs to no single one, so this
 *  names no resource and has no handle in `resources.ts`. */
export class Zcql {
  /** The ZCQL operations, acting with the scope's credentials. */
  static runIn(scope: CatalystScope): ScopedZcql {
    return new ScopedZcql(scope);
  }
}
