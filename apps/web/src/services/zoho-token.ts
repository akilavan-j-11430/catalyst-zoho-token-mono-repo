/**
 * Everything this app asks of the Zoho connection routes. A component imports from here
 * and never touches the client or a path.
 */
import { ApiPath } from "@repo/routing/api-path";
import type { ZohoConnectionStatus } from "@repo/types/zoho-token";
import { api, recordOf } from "@/services/api/client";

export async function fetchZohoConnectionStatus(): Promise<ZohoConnectionStatus> {
  return recordOf<ZohoConnectionStatus>(await api.get(ApiPath.ZohoToken + ApiPath.Status));
}

export async function disconnectZoho(): Promise<ZohoConnectionStatus> {
  return recordOf<ZohoConnectionStatus>(await api.post(ApiPath.ZohoToken + ApiPath.Disconnect));
}

/** Where to send the browser to connect. A navigation, not a call: the route answers with
 *  a redirect to Zoho's consent screen, which fetch cannot follow on the user's behalf. */
export function zohoConnectUrl(): string {
  return api.url(ApiPath.ZohoToken + ApiPath.Connect);
}
