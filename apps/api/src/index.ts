import "@/framework/catalyst-logger";
import { setLogTimeZone } from "@repo/node-utils/framework/logger";
import { ApiPath } from "@repo/routing/api-path";
import { join } from "@repo/routing/path";
import { ZohoConnection } from "@repo/node-utils/services/zoho/connection";
import { env } from "@/env";
import {
  errorHandler,
  initExecutionContext,
  recordRequestTiming
} from "@/middleware";
import { apiRouter } from "@/routes/api-router";
import { toErrorResponse } from "@/utils/api";
import express from "express";

setLogTimeZone(env.optional("TZ"));
ZohoConnection.setCredentials({
  accountsUrl: env.get("ZOHO_TOKEN_ACCOUNTS_URL"),
  clientId: env.get("ZOHO_TOKEN_CLIENT_ID"),
  clientSecret: env.get("ZOHO_TOKEN_CLIENT_SECRET"),
});

const PORT = Number(
  process.env["X_ZOHO_CATALYST_LISTEN_PORT"] ?? process.env["PORT"] ?? 8000,
);

const app = express();
app.use(express.json());
app.use(ApiPath.Api, initExecutionContext, recordRequestTiming);
app.use(join(ApiPath.Api, ApiPath.V1), apiRouter);
app.use("/", (_req, res) => {
  res.status(404).json(toErrorResponse("The requested url does not exist."));
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
