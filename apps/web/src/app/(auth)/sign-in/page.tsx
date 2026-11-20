import type { Metadata } from "next";
import { SignInWidget } from "@/components/auth/sign-in-widget";
import { CardFooterLink } from "@/components/auth/card-footer-link";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WebPath } from "@/web-path";

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
      <CardFooterLink prompt="New here?" href={WebPath.SignUp} label="Create an account" />
    </>
  );
}
