"use client";

import type { ErrorInfo } from "next/error";
import { PageError } from "@/components/shared/page-error";
import "./globals.css";

// Shown only when the root layout itself fails, so it renders the whole document and imports
// the styles itself. The Geist fonts load in the root layout, so here text falls back to the
// system face globals.css names after them.
export default function GlobalError({ error, retry }: ErrorInfo) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <title>Something went wrong | Catalyst App</title>
        <PageError error={error} retry={retry} />
      </body>
    </html>
  );
}
