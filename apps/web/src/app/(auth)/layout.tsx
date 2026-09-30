import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

// Not LayoutProps<...>: Next keys those by URL path, and a route group has none.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <Card className="min-h-auth-card w-full max-w-md">{children}</Card>
    </main>
  );
}
