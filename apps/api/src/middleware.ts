import {
  Request,
  Response,
  NextFunction,
  RequestHandler,
  ErrorRequestHandler,
} from "express";
import {
  currentContext,
  ExecutionContext,
  runWithContext,
} from "@repo/node-utils/framework/async-context";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { Catalyst } from "@repo/node-utils/services/catalyst/catalyst";
import { logger } from "@repo/node-utils/framework/logger";
import { UserManagement } from "@repo/node-utils/services/catalyst/user-management";
import { CatalystError } from "@repo/node-utils/errors/catalyst-error";
import { randomUUID } from "crypto";
import { zcAuth } from "@zcatalyst/auth";
import { HttpError } from "@/errors/http-error";
import { toErrorResponse } from "@/utils/api";

/** Records the timing of request execution from start to finish. */
export function recordRequestTiming(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startTime = Date.now();
  currentContext().manager.setExtras("req.startTime", startTime);
  const url = req.url;
  const method = req.method;
  logger.info(`Request execution started for ${method} ${url}`);
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    logger.info(
      `Request execution completed in ${duration} ms for ${method} ${url}.`,
    );
  });
  next();
}

/** Builds an app for every scope the request's headers allow. A scope that fails - User,
 *  when the request carries no signed-in user - is left unset, and only fails the request
 *  if something asks for it. */
async function initCatalystScopes(req: Request, catalyst: Catalyst): Promise<void> {
  await Promise.all(
    Object.values(CatalystScope).map(async (scope) => {
      try {
        catalyst.setApp(
          scope,
          await zcAuth.init(req as unknown as Parameters<typeof zcAuth.init>[0], {
            scope,
          }),
        );
      } catch (cause) {
        logger.info(`No ${scope}-scope Catalyst app: ${String(cause)}`);
      }
    }),
  );
}

/** Establishes the execution context for the request and runs the chain inside it. */
export const initExecutionContext: RequestHandler = (req, _res, next) => {
  // Catalyst reads both the project details and the caller's credentials off the headers,
  // so the apps are per-request and nothing needs to be configured in the environment.
  // `init` loads its implementation through a dynamic import, so it must be awaited - an
  // unawaited promise is truthy and only fails later, inside the SDK.
  const catalyst = new Catalyst();
  const context = new ExecutionContext({
    executionId: randomUUID(),
    catalyst,
    extras: {},
  });
  return runWithContext(context, async () => {
    await initCatalystScopes(req, catalyst);
    next();
  });
};

/** Rejects a request whose credentials do not resolve to a Catalyst app user. The user is
 *  memoized on the context, so handlers asking again later cost no second lookup. */
export const requireSignedInUser: RequestHandler = async (_req, _res, next) => {
  try {
    await UserManagement.currentUser();
  } catch (error) {
    if (error instanceof CatalystError) {
      logger.warn(error.toString());
      throw HttpError.Unauthorized("Sign in to continue.");
    }
    throw error;
  }
  next();
};

/** Terminal error handler - maps HttpError to its status, anything else to 500. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json(toErrorResponse(error.message));
    return;
  }
  console.error(`[server]`, error);
  res.status(500).json(toErrorResponse("Something went wrong."));
};
