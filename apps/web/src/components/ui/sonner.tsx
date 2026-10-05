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
          "--width": "26rem",
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--card-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "font-sans items-center gap-3 rounded-xl py-4 pr-11 pl-5",
          title: "text-sm font-semibold",
          description: "mt-0.5 text-sm leading-relaxed opacity-75",
        },
      }}
      {...props}
    />
  );
}
