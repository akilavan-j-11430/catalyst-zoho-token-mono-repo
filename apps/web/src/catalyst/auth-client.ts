import type { Authentication } from "@zcatalyst/auth/web";

export interface SignedInUser {
  emailId: string;
  firstName?: string;
  lastName?: string;
}

let session: Promise<Authentication> | null = null;

/**
 * The SDK reads `document` when its module is evaluated, which would crash the server
 * prerender of any component importing it, so it is pulled in on first use instead.
 * Holding the promise also makes `init` happen once - the SDK's own credential fetch
 * clears its in-flight promise in a `finally`, so concurrent callers each re-request.
 */
export function authSession(): Promise<Authentication> {
  if (session === null) {
    session = import("@zcatalyst/auth/web").then(async ({ zcAuth }) => {
      await zcAuth.init();
      return zcAuth;
    });
  }
  return session;
}

/**
 * Every URL handed to the SDK is resolved inside Catalyst's own iframe and by its
 * redirect endpoint, neither of which shares this app's origin, so a bare path would
 * resolve against theirs. Prefixing the current origin keeps one call site correct on
 * localhost and on the Slate domain.
 */
export function appUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function toSignedInUser(value: unknown): SignedInUser | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { email_id: emailId, first_name: firstName, last_name: lastName } = value as Record<
    string,
    unknown
  >;
  if (typeof emailId !== "string" || emailId === "") {
    return null;
  }
  return {
    emailId,
    firstName: typeof firstName === "string" ? firstName : undefined,
    lastName: typeof lastName === "string" ? lastName : undefined,
  };
}

/** Resolves the signed-in user, or null. A signed-out visitor is not an error. */
export async function currentUser(): Promise<SignedInUser | null> {
  const auth = await authSession();
  return toSignedInUser(await auth.isUserAuthenticated());
}
