import { ErrorCode } from "@/enums/error-codes";
import { CatalystError } from "@/errors/catalyst-error";
import { Datastore } from "@zcatalyst/datastore";
import type { CatalystScope } from "@/enums/catalyst-scope";
import { currentContext } from "@/framework/async-context";

type ZCQLResult = Awaited<ReturnType<Datastore["executeZCQLQuery"]>>;

/** A ZCQL result row. A query picks its own columns, so no table's row type describes it. */
export type ZcqlRow = Record<string, unknown>;

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope.
 *
 *  Both statements run through `Datastore` rather than `@zcatalyst/zcql`: the latter is
 *  still at 0.0.2 and has no OLAP method, so one client covers both modes. */
function datastore(scope: CatalystScope): Datastore {
  return new Datastore(currentContext().manager.catalyst.getApp(scope));
}

async function run(
  scope: CatalystScope,
  mode: string,
  query: string,
  call: (client: Datastore) => Promise<ZCQLResult>,
): Promise<ZcqlRow[]> {
  try {
    const result = await call(datastore(scope));
    // ZCQL wraps every row as { TableName: { ...columns } }; callers want the columns.
    return result.map(
      (row) => Object.assign({}, ...Object.values(row)) as ZcqlRow,
    );
  } catch (cause) {
    throw new CatalystError(
      ErrorCode.INVALID_RESOURCE,
      `${mode} failed: ${query}`,
      cause,
    );
  }
}

/** ZCQL statements bound to a scope. Reached only through `Zcql.runIn`. */
class ScopedZcql {
  constructor(private readonly scope: CatalystScope) {}

  /** Runs a ZCQL statement and returns rows flattened out of their table wrapper. */
  executeQuery(query: string): Promise<ZcqlRow[]> {
    return run(this.scope, "query", query, (client) =>
      client.executeZCQLQuery(query),
    );
  }

  /** Same, in OLAP mode - the analytical engine, for aggregates over large scans. */
  executeOlapQuery(query: string): Promise<ZcqlRow[]> {
    return run(this.scope, "olap query", query, (client) =>
      client.executeOLAPQuery(query),
    );
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
