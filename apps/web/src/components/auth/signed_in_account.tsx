"use client";

import { appUrl, authSession, type SignedInUser } from "@/catalyst/auth_client";
import { useSignedInUser } from "@/components/auth/auth_gate";
import { Button } from "@/components/ui/button";

function displayName(user: SignedInUser): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return full === "" ? user.email_id : full;
}

export function SignedInAccount() {
  const user = useSignedInUser();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight">{displayName(user)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{user.email_id}</p>
      </div>
      <Button
        variant="outline"
        onClick={() => void authSession().then((auth) => auth.signOut(appUrl("/sign-in")))}
      >
        Sign out
      </Button>
    </div>
  );
}
