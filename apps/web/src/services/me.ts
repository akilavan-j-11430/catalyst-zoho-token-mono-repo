import { ApiPath } from "@repo/routing/api-path";
import type { CurrentUser } from "@repo/types/user";
import { ApiClient, api } from "@/services/api/client";

/** Gateway: who the signed-in caller is, as the api knows them. */
export class MeService {
  static async fetchCurrentUser(): Promise<CurrentUser> {
    return ApiClient.recordOf<CurrentUser>(await api.get(ApiPath.Me));
  }
}
