import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";

interface CardFooterLinkProps {
  prompt: string;
  href: string;
  label: string;
}

/** `CardFooter` lays its children out as flex items, hence the explicit gap. */
export function CardFooterLink({ prompt, href, label }: CardFooterLinkProps) {
  return (
    <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
      {prompt}
      <Button asChild variant="link" className="h-auto p-0 align-baseline">
        <Link href={href}>{label}</Link>
      </Button>
    </CardFooter>
  );
}
