import { Router } from "express";
import { ApiPath } from "@repo/routing/api-path";
import { toRecordResponse } from "@repo/http-server/response";

export const pingRouter: Router = Router();

pingRouter.get(ApiPath.Ping, (_req, res) => {
  res.json(toRecordResponse({ message: "pong" }));
});
