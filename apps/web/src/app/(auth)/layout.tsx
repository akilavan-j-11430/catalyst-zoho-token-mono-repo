import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { RequestSession } from "@/catalyst/request-session";
import { Card } from "@/components/ui/card";

// Not LayoutProps<...>: Next keys those by URL path, and a route group has none.
// A visitor who is already signed in has no use for sign-in or sign-up, so goes home.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (RequestSession.isSignedIn(await headers())) {
    redirect("/");
  }
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <Card className="min-h-auth-card w-full max-w-md">{children}</Card>
    </main>
  );
}
