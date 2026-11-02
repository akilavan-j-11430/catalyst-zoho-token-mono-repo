/**
 * Everything this app asks of the auth routes. A component imports from here and never
 * touches the client or a path.
 */
import { ApiPath } from "@repo/routing/api-path";
import type { NewUser, RegisteredUser } from "@repo/types/user";
import { api, recordOf } from "@/services/api/client";

/** Registers an app user. Catalyst emails them a link to confirm and set a password. */
export async function registerUser(user: NewUser): Promise<RegisteredUser> {
  return recordOf<RegisteredUser>(await api.post(ApiPath.Auth + ApiPath.Register, user));
}
