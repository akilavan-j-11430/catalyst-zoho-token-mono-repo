import { Router } from "express";
import { ApiPath } from "@repo/routing/api-path";
import { UserManagement } from "@repo/node-utils/services/catalyst/user-management";
import type { NewUser } from "@repo/types/user";
import { env } from "@/env";
import { HttpError } from "@/errors/http-error";
import { toRecordResponse } from "@/utils/api";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimmed(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw HttpError.BadRequest(`${field} is required.`);
  }
  return value.trim();
}

function toNewUser(body: unknown): NewUser {
  if (typeof body !== "object" || body === null) {
    throw HttpError.BadRequest("Expected a JSON object.");
  }
  const fields = body as Record<string, unknown>;
  const emailId = trimmed(fields, "emailId");
  if (!EMAIL_PATTERN.test(emailId)) {
    throw HttpError.BadRequest("emailId is not a valid email address.");
  }
  return {
    firstName: trimmed(fields, "firstName"),
    lastName: trimmed(fields, "lastName"),
    emailId,
  };
}

export const authRouter: Router = Router();

authRouter.post(ApiPath.Register, async (req, res) => {
  const user = toNewUser(req.body);
  const registered = await UserManagement.register(
    user,
    env.get("AUTH_REDIRECT_URL"),
  );
  res.status(201).json(toRecordResponse(registered));
});
