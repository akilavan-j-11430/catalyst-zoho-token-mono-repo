"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CircleCheck, CircleDashed, PlugZap, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  disconnectZoho,
  fetchZohoConnectionStatus,
  zohoConnectUrl,
} from "@/services/zoho-token";

const STATUS_KEY = ["zohoToken", "status"];

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

export function ZohoConnectionPanel() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: STATUS_KEY,
    queryFn: fetchZohoConnectionStatus,
  });
  const { mutate, isPending } = useMutation({
    mutationFn: disconnectZoho,
    onSuccess: (status) => {
      queryClient.setQueryData(STATUS_KEY, status);
      toast.success("Zoho disconnected.");
    },
  });

  if (data === undefined) {
    return <Spinner aria-label="Checking your Zoho connection" className="mx-auto" />;
  }

  return (
    <div className="flex items-center gap-4">
      <span
        aria-hidden
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
          data.connected ? "bg-success-wash text-success" : "bg-muted text-muted-foreground"
        }`}
      >
        <PlugZap className="size-5" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium">Zoho</p>
        <ConnectionStatus connected={data.connected} />
      </div>
      {data.connected ? (
        <Button variant="outline" disabled={isPending} onClick={() => mutate()}>
          {isPending ? <Spinner aria-hidden /> : <Unplug aria-hidden />}
          Disconnect
        </Button>
      ) : (
        <Button onClick={() => window.location.assign(zohoConnectUrl())}>
          Connect
          <ArrowUpRight aria-hidden />
        </Button>
      )}
    </div>
  );
}
