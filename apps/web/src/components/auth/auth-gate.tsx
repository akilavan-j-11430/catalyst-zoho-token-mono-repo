"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AuthClient, type SignedInUser } from "@/catalyst/auth-client";
import { Loader } from "@/components/shared/loader";

const SignedInUserContext = createContext<SignedInUser | null>(null);

/** Only valid below an `AuthGate`, which renders nothing until the user is known. */
export function useSignedInUser(): SignedInUser {
  const user = useContext(SignedInUserContext);
  if (user === null) {
    throw new Error("useSignedInUser must be called inside an AuthGate.");
  }
  return user;
}

/**
 * Provides the signed-in user to everything below it, and renders nothing until that user
 * is known. The (app) layout has already turned a signed-out visitor away on the server, so
 * this only loads who they are. If the session has ended since, it sends them to sign-in.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const router = useRouter();

  useEffect(() => {
    // `replace`, not `push`: otherwise Back from /sign-in lands here and bounces.
    AuthClient.currentUser()
      .then((found) => (found === null ? router.replace("/sign-in") : setUser(found)))
      .catch(() => router.replace("/sign-in"));
  }, [router]);

  if (user === null) {
    return <Loader label="Checking your session" />;
  }

  return <SignedInUserContext.Provider value={user}>{children}</SignedInUserContext.Provider>;
}
