/**
 * Everything this app asks of the auth routes. A component imports from here and never
 * touches the client or a path.
 */
import type { NewUser, RegisteredUser } from "@repo/types/user";
import { api, recordOf } from "@/services/api/client";
import { endpoint } from "@/services/api/endpoints";

/** Registers an app user. Catalyst emails them a link to confirm and set a password. */
export async function registerUser(user: NewUser): Promise<RegisteredUser> {
  return recordOf<RegisteredUser>(await api.post(endpoint.auth.register, user));
}
