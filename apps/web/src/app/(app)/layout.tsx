import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth_gate";

// Every route in this group is behind the gate; /sign-in and /sign-up sit in (auth).
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <AuthGate>{children}</AuthGate>
    </main>
  );
}
