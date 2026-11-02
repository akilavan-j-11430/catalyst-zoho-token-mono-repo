import { ApiPath } from "@repo/routing/api-path";
import {
  errorHandler,
  initExecutionContext,
  recordRequestTiming,
} from "@/middleware";
import { apiRouter } from "@/routes/api-router";
import { toErrorResponse } from "@/utils/api";
import express, { type Express } from "express";

/** The whole HTTP surface, without a listener: `index.ts` serves it, and the integration
 *  tests drive it through Supertest. */
export const app: Express = express();

app.use(express.json());
app.use(ApiPath.Api, initExecutionContext, recordRequestTiming);
app.use(ApiPath.Api + ApiPath.V1, apiRouter);
app.use("/", (_req, res) => {
  res.status(404).json(toErrorResponse("The requested url does not exist."));
});

app.use(errorHandler);
