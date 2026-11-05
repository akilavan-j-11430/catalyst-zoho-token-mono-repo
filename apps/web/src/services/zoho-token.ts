import { ApiPath } from "@repo/routing/api-path";
import type { ZohoConnectionStatus } from "@repo/types/zoho-token";
import { api, ApiClient } from "@/services/api/client";

/**
 * Gateway: everything this app asks of the Zoho connection routes. A component calls these
 * and never touches the client or a path.
 */
export class ZohoTokenService {
  static async fetchStatus(): Promise<ZohoConnectionStatus> {
    return ApiClient.recordOf<ZohoConnectionStatus>(
      await api.get(ApiPath.ZohoToken + ApiPath.Status),
    );
  }

  static async disconnect(): Promise<ZohoConnectionStatus> {
    return ApiClient.recordOf<ZohoConnectionStatus>(
      await api.post(ApiPath.ZohoToken + ApiPath.Disconnect),
    );
  }

  /** Where to send the browser to connect. A navigation, not a call: the route answers with
   *  a redirect to Zoho's consent screen, which fetch cannot follow on the user's behalf. */
  static connectUrl(): string {
    return api.url(ApiPath.ZohoToken + ApiPath.Connect);
  }
}
