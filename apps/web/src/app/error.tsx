"use client";

import type { ErrorInfo } from "next/error";
import { PageError } from "@/components/shared/page-error";

// Catches whatever a page or layout below the root layout throws, so the root layout - its
// fonts and the Toaster - stays in place around the error.
export default function AppError({ error, retry }: ErrorInfo) {
  return <PageError error={error} retry={retry} />;
}
