import type { Metadata } from "next";
import { SignInWidget } from "@/components/auth/sign_in_widget";
import { CardFooterLink } from "@/components/auth/card_footer_link";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <>
      <CardHeader>
        <CardTitle className="text-2xl">Sign in</CardTitle>
        <CardDescription>Use the email your account was created with.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <SignInWidget />
      </CardContent>
      <CardFooterLink prompt="New here?" href="/sign-up" label="Create an account" />
    </>
  );
}
