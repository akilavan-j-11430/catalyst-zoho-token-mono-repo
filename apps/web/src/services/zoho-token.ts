/**
 * Everything this app asks of the Zoho connection routes. A component imports from here
 * and never touches the client or a path.
 */
import type { ZohoConnectionStatus } from "@repo/types/zoho-token";
import { api, recordOf } from "@/services/api/client";
import { endpoint } from "@/services/api/endpoints";

export async function fetchZohoConnectionStatus(): Promise<ZohoConnectionStatus> {
  return recordOf<ZohoConnectionStatus>(await api.get(endpoint.zohoToken.status));
}

export async function disconnectZoho(): Promise<ZohoConnectionStatus> {
  return recordOf<ZohoConnectionStatus>(await api.post(endpoint.zohoToken.disconnect));
}

/** Where to send the browser to connect. A navigation, not a call: the route answers with
 *  a redirect to Zoho's consent screen, which fetch cannot follow on the user's behalf. */
export function zohoConnectUrl(): string {
  return api.url(endpoint.zohoToken.connect);
}
