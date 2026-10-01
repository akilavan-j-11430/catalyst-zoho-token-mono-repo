import { Router } from "express";
import { ApiPath } from "@repo/routing/api-path";
import { toRecordResponse } from "@/utils/api";

export const pingRouter: Router = Router();

pingRouter.get(ApiPath.Ping, (_req, res) => {
  res.json(toRecordResponse({ message: "pong" }));
});
