import "server-only";
import "@/server-logging";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { ExecutionContext, runWithContext } from "@repo/async-context/async-context";
import type { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { CatalystSession } from "@repo/catalyst-node/catalyst-session";
import { Logger } from "@repo/logger/logger";

const logger = Logger.for("execution-context");

/** Sets the request's Catalyst app for each scope on the execution context in flight, and
 *  throws on the first that fails. */
async function setApps(scopes: CatalystScope[]): Promise<void> {
  // Catalyst reads the project details and the caller's credentials off these headers.
  const requestHeaders = Object.fromEntries(await headers());
  try {
    for (const scope of scopes) {
      await CatalystSession.setApp(requestHeaders, scope);
    }
  } catch (error) {
    // A CatalystError carrying only the SDK's code and message - never the headers.
    logger.error(String(error));
    throw error;
  }
}

function newExecutionContext(): ExecutionContext {
  return new ExecutionContext({ executionId: randomUUID(), extras: {} });
}

/**
 * Runs a page inside one execution context with the app for each scope set, so the page's
 * own reads find them and its log lines share one execution id. A scope that cannot be set -
 * User, for a visitor who is not signed in - throws before the page runs.
 *
 * Only the page's own body runs inside the context: React renders the components it returns
 * later, outside it. So the page reads, and passes what it read down as props.
 */
export function withCatalystPage<Props>(
  scopes: CatalystScope[],
  page: (props: Props) => Promise<ReactNode>,
): (props: Props) => Promise<ReactNode> {
  return async (props) =>
    runWithContext(newExecutionContext(), async () => {
      await setApps(scopes);
      return page(props);
    });
}

/**
 * Runs a Server Action or a route handler inside one execution context with the app for each
 * scope set, passing on every argument Next gives it - a route's `{ params }`, an action's
 * previous state. A scope that cannot be set throws before the call runs.
 */
export function withCatalystFn<Args extends unknown[], Result>(
  scopes: CatalystScope[],
  call: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args) =>
    runWithContext(newExecutionContext(), async () => {
      await setApps(scopes);
      return call(...args);
    });
}
