import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { UserManagement } from "@repo/catalyst-node/user-management";
import { SignedInAccount } from "@/components/auth/signed-in-account";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ZohoConnectionPanel } from "@/components/zoho-token/zoho-connection-panel";
import { withCatalystPage } from "@/execution-context";
import { ZohoConnections } from "@/zoho-connections";

// User for the caller and their Zoho grant row, Admin for the Catalyst Cache the connection
// checks first.
export default withCatalystPage(
  [CatalystScope.User, CatalystScope.Admin],
  async function HomePage() {
    const user = await UserManagement.currentUser();
    const isZohoConnected = await ZohoConnections.user().isConnected();
    return (
      <Card className="w-full max-w-md">
        <CardContent className="space-y-6">
          <SignedInAccount user={user} />
          <Separator />
          <ZohoConnectionPanel connected={isZohoConnected} />
        </CardContent>
      </Card>
    );
  },
);
