import { ExecutionContext, runWithContext } from "@repo/async-context/async-context";
import { CatalystScope } from "@/catalyst-scope";
import { CatalystSession } from "@/catalyst-session";

/** Runs `call` the way an entry point would: inside an execution context with an app set for
 *  each scope. `zcAuth` is faked by test/setup.ts, so both build from no headers at all. */
export function inRequest<T>(call: () => Promise<T>): Promise<T> {
  const context = new ExecutionContext({ executionId: "test-execution", extras: {} });
  return runWithContext(context, async () => {
    await CatalystSession.setApp({}, CatalystScope.User);
    await CatalystSession.setApp({}, CatalystScope.Admin);
    return call();
  });
}
