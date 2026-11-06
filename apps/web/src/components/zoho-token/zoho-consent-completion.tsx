"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ZohoGrantCode } from "@repo/types/zoho-token";
import { Loader } from "@/components/shared/loader";
import { ZohoTokenService } from "@/services/zoho-token";

/**
 * Posts what Zoho sent back to the api, then goes home either way - a failure is toasted by
 * the query client. `grant` is null when Zoho sent no code, as it does when consent is denied.
 */
export function ZohoConsentCompletion({ grant }: { grant: ZohoGrantCode | null }) {
  const router = useRouter();
  // A grant code is single-use at Zoho. React's development double-run of effects would
  // post it twice and toast the second, rejected exchange, so it is sent once per mount.
  const isSent = useRef(false);
  const { mutate } = useMutation({
    mutationFn: (sentGrant: ZohoGrantCode) => ZohoTokenService.completeConsent(sentGrant),
    onSuccess: () => toast.success("Zoho connected."),
    onSettled: () => router.replace("/"),
  });

  useEffect(() => {
    if (isSent.current) {
      return;
    }
    isSent.current = true;
    if (grant === null) {
      toast.error("Zoho consent did not complete. Connect again to retry.");
      router.replace("/");
      return;
    }
    mutate(grant);
  }, [grant, mutate, router]);

  return <Loader label="Connecting your Zoho account" />;
}
