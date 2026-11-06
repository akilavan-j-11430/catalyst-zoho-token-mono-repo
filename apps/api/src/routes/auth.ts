import { Router } from "express";
import { z } from "zod";
import { ApiPath } from "@repo/routing/api-path";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { UserManagement } from "@repo/node-utils/catalyst/user-management";
import type { NewUser } from "@repo/types/user";
import { initCatalystScopes } from "@repo/http-server/middleware";
import { RequestInput } from "@repo/http-server/request-input";
import { toRecordResponse } from "@repo/http-server/response";
import { env } from "@/env";

/** What a registration must send. Each message says what is wrong with its field. */
const newUserSchema = z.object(
  {
    firstName: z.string({ error: "is required." }).trim().min(1, "is required."),
    lastName: z.string({ error: "is required." }).trim().min(1, "is required."),
    emailId: z
      .string({ error: "is required." })
      .trim()
      .pipe(z.email("is not a valid email address.")),
  },
  { error: "Expected a JSON object." },
);

export const authRouter: Router = Router();

authRouter.post(
  ApiPath.Register,
  initCatalystScopes([CatalystScope.Admin]),
  async (req, res) => {
    const user: NewUser = RequestInput.parse(newUserSchema, req.body);
    const registered = await UserManagement.register(
      user,
      env.get("AUTH_REDIRECT_URL"),
    );
    res.status(201).json(toRecordResponse(registered));
  },
);
