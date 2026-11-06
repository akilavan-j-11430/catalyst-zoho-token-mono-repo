import { Router } from "express";
import { ApiPath } from "@repo/routing/api-path";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { UserManagement } from "@repo/node-utils/catalyst/user-management";
import { initCatalystScopes } from "@repo/http-server/middleware";
import { toRecordResponse } from "@repo/http-server/response";

export const meRouter: Router = Router();

meRouter.get(ApiPath.Me, initCatalystScopes([CatalystScope.User]), async (_req, res) => {
  res.json(toRecordResponse(await UserManagement.currentUser()));
});
