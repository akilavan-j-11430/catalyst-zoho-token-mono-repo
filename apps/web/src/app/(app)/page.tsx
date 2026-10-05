import { SignedInAccount } from "@/components/auth/signed-in-account";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ZohoConnectionPanel } from "@/components/zoho-token/zoho-connection-panel";

export default function HomePage() {
  return (
    <Card className="w-full max-w-md">
      <CardContent className="space-y-6">
        <SignedInAccount />
        <Separator />
        <ZohoConnectionPanel />
      </CardContent>
    </Card>
  );
}
