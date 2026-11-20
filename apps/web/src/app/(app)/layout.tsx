import type { ReactNode } from "react";

// Every route in this group needs a signed-in user; /sign-in and /sign-up sit in (auth).
// src/proxy.ts turns a signed-out visitor away before this renders, and each page names the
// scopes it reads with withCatalystPage, which is what protects the data.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      {children}
    </main>
  );
}
