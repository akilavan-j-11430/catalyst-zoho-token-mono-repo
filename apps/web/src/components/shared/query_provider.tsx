"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError } from "@/services/api/client";

/**
 * Every failed query and mutation lands here, so no call site writes error handling of
 * its own. An `ApiError` already carries the message the API chose; anything else is a
 * bug on this side and gets a generic line rather than a stack trace in a toast.
 */
function createQueryClient(): QueryClient {
  const onError = (error: Error): void => {
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
  // Held in state so the cache is created once per client and never shared across renders.
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
