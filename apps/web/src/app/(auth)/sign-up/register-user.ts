"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { UserManagement } from "@repo/catalyst-node/user-management";
import { InputValidation } from "@repo/input-validation/input-validation";
import { InvalidInputError } from "@repo/input-validation/invalid-input-error";
import type { NewUser, RegisteredUser } from "@repo/types/user";
import { withCatalystFn } from "@/execution-context";
import { WebPath } from "@/web-path";

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

/** A rejected field comes back rather than being thrown: Next shows the browser only a
 *  digest of a thrown error. */
export type RegisterResult =
  | { ok: true; registered: RegisteredUser }
  | { ok: false; field: string; problem: string };

/** Where Catalyst sends a new user from the confirmation email: this app's home page. A
 *  Server Action request always carries `Origin`, and Next has already checked it against the
 *  request's host, so it is this app's own origin - local or Slate alike. */
async function redirectUrl(): Promise<string> {
  const origin = (await headers()).get("origin");
  if (origin === null) {
    throw new Error("A Server Action request arrived without an Origin header.");
  }
  return new URL(WebPath.Home, origin).toString();
}

/**
 * Registers an app user. Catalyst emails them a link to confirm and set a password. Admin,
 * because registering is not a browser SDK method and the caller has no account yet. Like
 * every Server Action, anyone can call it, so the input is checked here again.
 */
export const registerUser = withCatalystFn(
  [CatalystScope.Admin],
  async (input: unknown): Promise<RegisterResult> => {
    try {
      const user: NewUser = InputValidation.parse(newUserSchema, input);
      const registered = await UserManagement.register({
        user,
        redirectUrl: await redirectUrl(),
      });
      return { ok: true, registered };
    } catch (error) {
      if (error instanceof InvalidInputError) {
        return { ok: false, field: error.field, problem: error.problem };
      }
      throw error;
    }
  },
);
