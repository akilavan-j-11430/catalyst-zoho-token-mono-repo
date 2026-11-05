import { ApiPath } from "@repo/routing/api-path";
import type { NewUser, RegisteredUser } from "@repo/types/user";
import { api, ApiClient } from "@/services/api/client";

/**
 * Gateway: everything this app asks of the auth routes. A component calls these and never
 * touches the client or a path.
 */
export class AuthService {
  /** Registers an app user. Catalyst emails them a link to confirm and set a password. */
  static async registerUser(user: NewUser): Promise<RegisteredUser> {
    return ApiClient.recordOf<RegisteredUser>(await api.post(ApiPath.Auth + ApiPath.Register, user));
  }
}
