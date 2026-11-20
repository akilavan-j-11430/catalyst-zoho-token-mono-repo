"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  completeZohoConsent,
  type ZohoGrantCode,
} from "@/app/(app)/zoho-token/callback/complete-zoho-consent";
import { Loader } from "@/components/shared/loader";
import { WebPath } from "@/web-path";

const RETRY_MESSAGE = "Zoho consent did not complete. Connect again to retry.";

/**
 * Hands what Zoho sent back to `completeZohoConsent`, then goes home either way. `grant` is
 * null when Zoho sent no code, as it does when consent is denied.
 */
export function ZohoConsentCompletion({ grant }: { grant: ZohoGrantCode | null }) {
  const router = useRouter();
  // A grant code is single-use at Zoho. React's development double-run of effects would
  // send it twice and toast the second, rejected exchange, so it is sent once per mount.
  const isSent = useRef(false);

  useEffect(() => {
    if (isSent.current) {
      return;
    }
    isSent.current = true;
    if (grant === null) {
      toast.error(RETRY_MESSAGE);
      router.replace(WebPath.Home);
      return;
    }
    void (async () => {
      try {
        const result = await completeZohoConsent(grant);
        if (result.ok) {
          toast.success("Zoho connected.");
        } else {
          toast.error(result.problem);
        }
      } catch {
        toast.error("Zoho could not be connected. Please try again.");
      }
      router.replace(WebPath.Home);
    })();
  }, [grant, router]);

  return <Loader label="Connecting your Zoho account" />;
}
