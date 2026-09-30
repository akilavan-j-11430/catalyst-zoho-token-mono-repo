import { Spinner } from "@/components/ui/spinner";

interface LoaderProps {
  label: string;
}

/**
 * shadcn's `Spinner` is the bare icon. The halo behind it is what makes a wait
 * read as deliberate rather than stalled; under `prefers-reduced-motion` the
 * guard in globals.css stops both animations and the label carries the meaning.
 *
 * The box is a fixed 20rem - the same height the sign-in frame starts at - so the
 * card does not resize when the wait ends, and the spinner sits in its middle.
 */
export function Loader({ label }: LoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-80 w-full flex-col items-center justify-center gap-3 text-muted-foreground"
    >
      <span className="relative flex size-10 items-center justify-center">
        <span className="absolute inset-0 animate-pulse rounded-full bg-primary/10" />
        <Spinner aria-hidden className="size-5 text-primary" />
      </span>
      <span className="text-sm">{label}</span>
    </div>
  );
}
