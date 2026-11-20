"use client";

import { LogOut } from "lucide-react";
import type { CurrentUser } from "@repo/types/user";
import { AuthClient } from "@/catalyst/auth-client";
import { Button } from "@/components/ui/button";
import { WebPath } from "@/web-path";

function displayName(user: CurrentUser): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return full === "" ? user.emailId : full;
}

/** The signed-in user, read by the page on the server, with a sign-out button. */
export function SignedInAccount({ user }: { user: CurrentUser }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight">{displayName(user)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{user.emailId}</p>
      </div>
      <Button
        variant="outline"
        onClick={() => void AuthClient.signOut(WebPath.SignIn)}
      >
        <LogOut aria-hidden />
        Sign out
      </Button>
    </div>
  );
}
