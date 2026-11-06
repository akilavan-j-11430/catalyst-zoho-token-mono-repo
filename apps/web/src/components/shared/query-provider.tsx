"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError } from "@/services/api/client";

/**
 * Every failed query and mutation lands here, so no call site writes error handling of
 * its own. An `ApiError` already carries the message the API chose; anything else is a
 * bug on this side and gets a generic line rather than a stack trace in a toast.
 *
 * A 401 is not a message for the person: it means their session has ended since the page
 * loaded, so `onSessionEnded` sends them to sign-in instead.
 */
function createQueryClient(onSessionEnded: () => void): QueryClient {
  const onError = (error: Error): void => {
    if (error instanceof ApiError && error.status === 401) {
      onSessionEnded();
      return;
    }
    toast.error(
      error instanceof ApiError
        ? error.message
        : "Something went wrong. Try again.",
    );
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Held in state so the cache is created once per client and never shared across renders.
  // `replace`, not `push`, so Back does not return to a page that can no longer load.
  const [queryClient] = useState(() => createQueryClient(() => router.replace("/sign-in")));
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
