"use client";

import { Check, TriangleAlert } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * `theme` is fixed to light: `globals.css` binds the `dark:` variant to a `.dark`
 * ancestor that nothing sets, so there is no theme to follow and no reason to pull in
 * `next-themes` the way the upstream component does.
 *
 * Only layout and type live here. The colour of a toast - the wash, the accent rail, the
 * icon halo - is set in `globals.css`, where the selectors are wide enough to beat
 * sonner's own. See the note there before changing how a toast looks.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-center"
      closeButton
      icons={{
        success: <Check strokeWidth={3} />,
        error: <TriangleAlert strokeWidth={2.25} />,
      }}
      style={
        {
          "--width": "75vw",
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--card-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "font-sans items-center gap-5 rounded-2xl py-8 pr-8 pl-9",
          title: "text-lg font-semibold tracking-tight",
          description: "mt-2 text-sm leading-relaxed opacity-75",
        },
      }}
      {...props}
    />
  );
}
