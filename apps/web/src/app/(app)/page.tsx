import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { UserManagement } from "@repo/catalyst-node/user-management";
import { SignedInAccount } from "@/components/auth/signed-in-account";
import { Card, CardContent } from "@/components/ui/card";
import { withCatalystPage } from "@/execution-context";

export default withCatalystPage([CatalystScope.User], async function HomePage() {
  const user = await UserManagement.currentUser();
  return (
    <Card className="w-full max-w-md">
      <CardContent>
        <SignedInAccount user={user} />
      </CardContent>
    </Card>
  );
});
