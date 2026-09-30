import { Router } from "express";
import { toRecordResponse } from "@/utils/api";

export const pingRouter: Router = Router();

pingRouter.get("/ping", (_req, res) => {
  res.json(toRecordResponse({ message: "pong" }));
});
