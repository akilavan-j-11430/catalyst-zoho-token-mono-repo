import type { Metadata } from "next";
import type { ZohoGrantCode } from "@repo/types/zoho-token";
import { ZohoConsentCompletion } from "@/components/zoho-token/zoho-consent-completion";

export const metadata: Metadata = { title: "Connecting Zoho" };

/**
 * Where Zoho sends the browser after its consent screen - the Authorized Redirect URI, built
 * by `apps/api` from `WebPath`. Move this folder and that value together.
 */
export default async function ZohoTokenCallbackPage({
  searchParams,
}: PageProps<"/zoho-token/callback">) {
  const { code, state } = await searchParams;
  // Zoho sends `error` and no code when consent is denied, so a missing code covers that too.
  const grant: ZohoGrantCode | null =
    typeof code === "string" && typeof state === "string" ? { code, state } : null;
  return <ZohoConsentCompletion grant={grant} />;
}
