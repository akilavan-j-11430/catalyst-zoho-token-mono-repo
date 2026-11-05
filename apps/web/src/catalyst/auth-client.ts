import type { Authentication } from "@zcatalyst/auth/web";
import { CamelCase } from "@repo/case-conversion/camel-case";

export interface SignedInUser {
  emailId: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Facade: everything this app asks of the Catalyst web SDK - the session, the signed-in
 * user, and the URLs handed to the SDK. The only code in this app that reaches it.
 */
export class AuthClient {
  private static pendingSession: Promise<Authentication> | null = null;

  /**
   * The SDK reads `document` when its module is evaluated, which would crash the server
   * prerender of any component importing it, so it is pulled in on first use instead.
   * Holding the promise also makes `init` happen once - the SDK's own credential fetch
   * clears its in-flight promise in a `finally`, so concurrent callers each re-request.
   */
  static session(): Promise<Authentication> {
    if (AuthClient.pendingSession === null) {
      AuthClient.pendingSession = import("@zcatalyst/auth/web").then(async ({ zcAuth }) => {
        await zcAuth.init();
        return zcAuth;
      });
    }
    return AuthClient.pendingSession;
  }

  /**
   * Every URL handed to the SDK is resolved inside Catalyst's own iframe and by its
   * redirect endpoint, neither of which shares this app's origin, so a bare path would
   * resolve against theirs. Prefixing the current origin keeps one call site correct on
   * localhost and on the Slate domain.
   */
  static appUrl(path: string): string {
    return new URL(path, window.location.origin).toString();
  }

  /** Resolves the signed-in user, or null. A signed-out visitor is not an error. */
  static async currentUser(): Promise<SignedInUser | null> {
    const auth = await AuthClient.session();
    return AuthClient.toSignedInUser(await auth.isUserAuthenticated());
  }

  private static toSignedInUser(value: unknown): SignedInUser | null {
    if (typeof value !== "object" || value === null) {
      return null;
    }
    const { emailId, firstName, lastName } = CamelCase.convertKeys(value as Record<string, unknown>);
    if (typeof emailId !== "string" || emailId === "") {
      return null;
    }
    return {
      emailId,
      firstName: typeof firstName === "string" ? firstName : undefined,
      lastName: typeof lastName === "string" ? lastName : undefined,
    };
  }
}
