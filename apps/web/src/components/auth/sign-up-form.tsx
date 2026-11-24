"use client";

import { useTransition } from "react";
import {
  useForm,
  type FieldErrors,
  type Resolver,
  type ResolverResult,
} from "react-hook-form";
import { toast } from "sonner";
import type { NewUser } from "@repo/types/user";
import { registerUser } from "@/app/(auth)/sign-up/register-user";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/shared/loader";
import { FieldGroup } from "@/components/ui/field";

const EMPTY: NewUser = { firstName: "", lastName: "", emailId: "" };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalid(message: string): { type: string; message: string } {
  return { type: "validate", message };
}

/**
 * These rules are for the person typing. `registerUser` validates the same input again on the
 * server and is the one that decides - a browser can always be skipped.
 */
const resolveSignUp: Resolver<NewUser> = (
  values,
): ResolverResult<NewUser> => {
  const errors: FieldErrors<NewUser> = {};
  if (values.firstName.trim() === "") {
    errors.firstName = invalid("Enter your first name.");
  }
  if (values.lastName.trim() === "") {
    errors.lastName = invalid("Enter your last name.");
  }
  if (values.emailId.trim() === "") {
    errors.emailId = invalid("Enter your email address.");
  } else if (!EMAIL_PATTERN.test(values.emailId.trim())) {
    errors.emailId = invalid("Enter a valid email address.");
  }
  if (Object.keys(errors).length > 0) {
    return { values: {}, errors };
  }
  // Trimmed here so whatever submits them never repeats the work.
  return {
    values: {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      emailId: values.emailId.trim(),
    },
    errors: {},
  };
};

export function SignUpForm() {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<NewUser>({ resolver: resolveSignUp, defaultValues: EMPTY });
  const [isPending, startTransition] = useTransition();

  function submit(user: NewUser): void {
    startTransition(async () => {
      try {
        const result = await registerUser(user);
        if (!result.ok) {
          // The server's own check, on a field the browser's rules let through.
          if (result.field in EMPTY) {
            setError(result.field as keyof NewUser, { message: result.problem });
          } else {
            toast.error(result.problem);
          }
          return;
        }
        toast.success("Check your email", {
          description: `We sent a confirmation link to ${result.registered.emailId}. Open it to set your password and finish signing up.`,
        });
        reset(EMPTY);
      } catch {
        toast.error("Your account could not be created. Please try again.");
      }
    });
  }

  if (isPending) {
    return <Loader label="Creating your account" />;
  }

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      autoComplete="off"
    >
      <FieldGroup>
        <FormField
          id="first-name"
          label="First name"
          type="text"
          placeholder="Alex"
          error={errors.firstName?.message}
          field={register("firstName")}
        />
        <FormField
          id="last-name"
          label="Last name"
          type="text"
          placeholder="Taylor"
          error={errors.lastName?.message}
          field={register("lastName")}
        />
        <FormField
          id="email"
          label="Email address"
          type="email"
          placeholder="you@example.com"
          error={errors.emailId?.message}
          field={register("emailId")}
        />
        <Button type="submit" className="w-full">
          Create account
        </Button>
      </FieldGroup>
    </form>
  );
}
