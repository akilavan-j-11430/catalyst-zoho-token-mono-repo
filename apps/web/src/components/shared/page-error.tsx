"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface PageErrorProps {
  /** What the page threw. An error from the server arrives with only a digest - Next never
   *  sends its message to the browser - so the message is not shown. */
  error: unknown;
  retry: () => void;
}

function digestOf(error: unknown): string | undefined {
  return error instanceof Error && "digest" in error && typeof error.digest === "string"
    ? error.digest
    : undefined;
}

/** Shown in place of a page that failed to render, by `app/error.tsx` and
 *  `app/global-error.tsx`. The reference is the digest `instrumentation.ts` logs it under. */
export function PageError({ error, retry }: PageErrorProps) {
  const digest = digestOf(error);
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            This page could not load. Try again, and if it keeps failing, share the reference
            below.
          </CardDescription>
        </CardHeader>
        {digest && (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Reference: <code className="font-mono">{digest}</code>
            </p>
          </CardContent>
        )}
        <CardFooter>
          <Button variant="outline" onClick={() => retry()}>
            <RotateCw aria-hidden />
            Try again
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
