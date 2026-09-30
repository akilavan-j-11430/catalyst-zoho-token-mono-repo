import "@/framework/catalyst_logger";
import { setLogTimeZone } from "@repo/node-utils/framework/logger";
import { env } from "@/env";
import {
  errorHandler,
  initExecutionContext,
  recordRequestTiming,
} from "@/middleware";
import { apiRouter } from "@/routes/api_router";
import { toErrorResponse } from "@/utils/api";
import express from "express";

setLogTimeZone(env.optional("TZ"));

const PORT = Number(
  process.env["X_ZOHO_CATALYST_LISTEN_PORT"] ?? process.env["PORT"] ?? 8000,
);

const app = express();
app.use(express.json());
app.use("/api", initExecutionContext, recordRequestTiming);
app.use("/api", apiRouter);
app.use("/", (_req, res) => {
  res.status(404).json(toErrorResponse("The requested url does not exist."));
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
