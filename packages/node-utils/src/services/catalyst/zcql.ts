import { ErrorCode } from "@/enums/error_codes";
import { CatalystError } from "@/errors/catalyst_error";
import { Datastore } from "@zcatalyst/datastore";
import { currentContext } from "@/framework/async_context";
import type { TableRow } from "@/services/catalyst/table";

type ZCQLResult = Awaited<ReturnType<Datastore["executeZCQLQuery"]>>;

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope.
 *
 *  Both statements run through `Datastore` rather than `@zcatalyst/zcql`: the latter is
 *  still at 0.0.2 and has no OLAP method, so one client covers both modes. */
function datastore(): Datastore {
  return new Datastore(currentContext().manager.catalyst);
}

async function run(
  mode: string,
  query: string,
  call: (client: Datastore) => Promise<ZCQLResult>,
): Promise<TableRow[]> {
  try {
    const result = await call(datastore());
    // ZCQL wraps every row as { TableName: { ...columns } }; callers want the columns.
    return result.map(
      (row) => Object.assign({}, ...Object.values(row)) as TableRow,
    );
  } catch (cause) {
    throw new CatalystError(
      ErrorCode.INVALID_RESOURCE,
      `${mode} failed: ${query}`,
      cause,
    );
  }
}

/** ZCQL statements. A query joins across tables and belongs to no single one, so this
 *  has no instance to create - unlike the other wrappers here. */
export class Zcql {
  /** Runs a ZCQL statement and returns rows flattened out of their table wrapper. */
  static executeQuery(query: string): Promise<TableRow[]> {
    return run("query", query, (client) => client.executeZCQLQuery(query));
  }

  /** Same, in OLAP mode - the analytical engine, for aggregates over large scans. */
  static executeOlapQuery(query: string): Promise<TableRow[]> {
    return run("olap query", query, (client) => client.executeOLAPQuery(query));
  }
}
