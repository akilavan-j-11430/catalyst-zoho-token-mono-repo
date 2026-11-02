"use client";

import { LogOut } from "lucide-react";
import { appUrl, authSession, type SignedInUser } from "@/catalyst/auth-client";
import { useSignedInUser } from "@/components/auth/auth-gate";
import { Button } from "@/components/ui/button";

function displayName(user: SignedInUser): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return full === "" ? user.emailId : full;
}

export function SignedInAccount() {
  const user = useSignedInUser();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight">{displayName(user)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{user.emailId}</p>
      </div>
      <Button
        variant="outline"
        onClick={() => void authSession().then((auth) => auth.signOut(appUrl("/sign-in")))}
      >
        <LogOut aria-hidden />
        Sign out
      </Button>
    </div>
  );
}
