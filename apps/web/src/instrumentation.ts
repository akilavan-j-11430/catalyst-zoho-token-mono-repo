import type { Instrumentation } from "next";

// Next builds this file for the Edge runtime as well, which has neither of the Node APIs
// @repo/logger needs (fs, async_hooks), so the logger is only imported when running on Node.

/** Logs every uncaught error from a page, a Server Action, a route handler or proxy.ts, with
 *  the digest the error screen shows, so a reference a user reads out finds its line. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  // Next bundles this file with its own copy of @repo/logger, apart from the one pages and
  // actions configure through execution-context.ts. Importing server-logging configures this
  // copy on the first error; every later import is cached and runs nothing.
  await import("@/server-logging");
  const { Logger } = await import("@repo/logger/logger");
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? error.digest : undefined;
  // The path without its query string, and no headers: both can carry credentials.
  const path = request.path.split("?")[0];
  Logger.for("request-error").error({ routeType: context.routeType, path, digest }, error);
};
