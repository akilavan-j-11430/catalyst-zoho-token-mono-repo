import { ApiPath } from "@repo/routing/api-path";
import type {
  ZohoConnectionStatus,
  ZohoConsent,
  ZohoGrantCode,
} from "@repo/types/zoho-token";
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

  /** Where to send the browser for Zoho's consent screen. Fetched rather than navigated to,
   *  so the call carries the bearer token. */
  static async fetchConsentUrl(): Promise<string> {
    const consent = await ApiClient.recordOf<ZohoConsent>(
      await api.get(ApiPath.ZohoToken + ApiPath.Connect),
    );
    return consent.consentUrl;
  }

  /** Hands the api what Zoho sent the callback page, which stores the grant. */
  static async completeConsent(grant: ZohoGrantCode): Promise<ZohoConnectionStatus> {
    return ApiClient.recordOf<ZohoConnectionStatus>(
      await api.post(ApiPath.ZohoToken + ApiPath.Callback, grant),
    );
  }

  static async disconnect(): Promise<ZohoConnectionStatus> {
    return ApiClient.recordOf<ZohoConnectionStatus>(
      await api.post(ApiPath.ZohoToken + ApiPath.Disconnect),
    );
  }
}
