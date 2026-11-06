"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { CurrentUser } from "@repo/types/user";
import { Loader } from "@/components/shared/loader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { MeService } from "@/services/me";

const CurrentUserContext = createContext<CurrentUser | null>(null);

/** Only valid below an `AuthGate`, which renders nothing until the user is known. */
export function useSignedInUser(): CurrentUser {
  const user = useContext(CurrentUserContext);
  if (user === null) {
    throw new Error("useSignedInUser must be called inside an AuthGate.");
  }
  return user;
}

/**
 * Provides the signed-in user to everything below it, and renders nothing until that user
 * is known. The (app) layout has already turned a signed-out visitor away on the server, so
 * this only loads who they are, from the api. A 401 there means the session has ended, and
 * `QueryProvider` sends them to sign-in; any other failure offers a retry.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  // Who is signed in does not change without a reload, so it is fetched once per page load.
  const { data: user, isPending, isError, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: () => MeService.fetchCurrentUser(),
    staleTime: Infinity,
  });

  if (isPending) {
    return <Loader label="Checking your session" />;
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Your account could not be loaded.</AlertTitle>
        <AlertDescription>
          <Button variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}
