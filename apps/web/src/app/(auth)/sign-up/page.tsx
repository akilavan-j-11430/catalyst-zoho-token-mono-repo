import type { Metadata } from "next";
import { SignUpForm } from "@/components/auth/sign_up_form";
import { CardFooterLink } from "@/components/auth/card_footer_link";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <>
      <CardHeader>
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>
          We will email you a link to confirm your address and set a password.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <SignUpForm />
      </CardContent>
      <CardFooterLink prompt="Already have an account?" href="/sign-in" label="Sign in" />
    </>
  );
}
