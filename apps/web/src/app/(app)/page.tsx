import { SignedInAccount } from "@/components/auth/signed_in_account";
import { Card, CardContent } from "@/components/ui/card";

export default function HomePage() {
  return (
    <Card className="w-full max-w-md">
      <CardContent>
        <SignedInAccount />
      </CardContent>
    </Card>
  );
}
