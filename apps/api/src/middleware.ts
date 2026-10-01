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

/** Establishes the execution context for the request and runs the chain inside it. */
export const initExecutionContext: RequestHandler = (req, _res, next) => {
  // Catalyst reads both the project details and the caller's credentials off the headers,
  // so the apps are per-request and nothing needs to be configured in the environment.
  // A scope that fails - User, when the request carries no signed-in user - is left unset
  // and only fails the request if something asks for it. `init` loads its implementation
  // through a dynamic import, so it must be awaited.
  const catalyst = new Catalyst();
  const context = new ExecutionContext({ executionId: randomUUID(), catalyst, extras: {} });
  return runWithContext(context, async () => {
    await Promise.all(
      Object.values(CatalystScope).map(async (scope) => {
        try {
          catalyst.setApp(
            scope,
            await zcAuth.init(req as unknown as Parameters<typeof zcAuth.init>[0], { scope }),
          );
        } catch (cause) {
          logger.info(`No ${scope}-scope Catalyst app: ${String(cause)}`);
        }
      }),
    );
    next();
  });
};

/** Rejects a request whose credentials do not resolve to a Catalyst app user. The user is
 *  memoized on the context, so handlers asking again later cost no second lookup. */
export const validateUserAuthentication: RequestHandler = async (
  _req,
  _res,
  next,
) => {
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
