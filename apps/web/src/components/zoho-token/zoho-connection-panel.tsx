"use client";

import { ArrowUpRight, CircleCheck, CircleDashed, PlugZap, Unplug } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { connectZoho } from "@/app/(app)/connect-zoho";
import { disconnectZoho } from "@/app/(app)/disconnect-zoho";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function ConnectionStatus({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="flex items-center gap-1 text-sm text-success">
      <CircleCheck aria-hidden className="size-3.5" />
      Connected
    </span>
  ) : (
    <span className="flex items-center gap-1 text-sm text-muted-foreground">
      <CircleDashed aria-hidden className="size-3.5" />
      Not connected
    </span>
  );
}

function ConnectButton() {
  const [isPending, startTransition] = useTransition();
  // Stays set once the consent url arrives, so the button stays disabled while the browser
  // leaves for Zoho, which then sends it back to the /zoho-token/callback page.
  const [isLeavingForZoho, setIsLeavingForZoho] = useState(false);

  function connect(): void {
    startTransition(async () => {
      try {
        const result = await connectZoho();
        if (!result.ok) {
          toast.error(result.problem);
          return;
        }
        setIsLeavingForZoho(true);
        window.location.assign(result.consentUrl);
      } catch {
        toast.error("Zoho could not be reached. Please try again.");
      }
    });
  }

  const isBusy = isPending || isLeavingForZoho;
  return (
    <Button disabled={isBusy} onClick={connect}>
      Connect
      {isBusy ? <Spinner aria-hidden /> : <ArrowUpRight aria-hidden />}
    </Button>
  );
}

function DisconnectButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function disconnect(): void {
    startTransition(async () => {
      try {
        await disconnectZoho();
        setIsOpen(false);
        toast.success("Zoho disconnected.");
      } catch {
        toast.error("Zoho could not be disconnected. Please try again.");
      }
    });
  }

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        // Not dismissed while the disconnect runs, so the outcome is always seen.
        if (!isPending) {
          setIsOpen(open);
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Unplug aria-hidden />
          Disconnect
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect Zoho?</AlertDialogTitle>
          <AlertDialogDescription>
            This app loses access to your Zoho account, and Zoho revokes the permission you
            gave it. To use Zoho here again, connect and give consent again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              // Kept open until the disconnect finishes, rather than closing on click.
              event.preventDefault();
              disconnect();
            }}
          >
            {isPending && <Spinner aria-hidden />}
            {isPending ? "Disconnecting" : "Disconnect Zoho"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The signed-in user's Zoho connection, read by the page on the server. */
export function ZohoConnectionPanel({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <span
        aria-hidden
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
          connected ? "bg-success-wash text-success" : "bg-muted text-muted-foreground"
        }`}
      >
        <PlugZap className="size-5" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium">Zoho</p>
        <ConnectionStatus connected={connected} />
      </div>
      {connected ? <DisconnectButton /> : <ConnectButton />}
    </div>
  );
}
