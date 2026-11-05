import type { Authentication } from "@zcatalyst/auth/web";
import { CamelCase } from "@repo/case-conversion/camel-case";

export interface SignedInUser {
  emailId: string;
  firstName?: string;
  lastName?: string;
}

interface AuthToken {
  accessToken: string;
  /** Asked for again from here on, while the old one still has a minute to live. */
  refreshAt: number;
}

/**
 * Facade: everything this app asks of the Catalyst web SDK - the session, the signed-in
 * user, the API token, and the URLs handed to the SDK. The only code in this app that
 * reaches it.
 */
export class AuthClient {
  private static readonly TOKEN_REFRESH_MARGIN_MS = 60_000;

  private static pendingSession: Promise<Authentication> | null = null;
  private static pendingToken: Promise<AuthToken> | null = null;

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

  /**
   * The caller's credential for `apps/api`. Slate and AppSail are separate origins, so the
   * session cookie never reaches the API and this bearer token carries the user instead.
   * One token serves every call until it nears expiry - each issue is two Catalyst round
   * trips - and concurrent callers share the one in flight. It needs a session, so only
   * the client for signed-in routes resolves it.
   */
  static async authHeaders(): Promise<Record<string, string>> {
    AuthClient.pendingToken ??= AuthClient.issueAuthToken();
    try {
      const token = await AuthClient.pendingToken;
      if (Date.now() >= token.refreshAt) {
        AuthClient.pendingToken = null;
      }
      return { authorization: `Bearer ${token.accessToken}` };
    } catch (error) {
      AuthClient.pendingToken = null;
      throw error;
    }
  }

  private static async issueAuthToken(): Promise<AuthToken> {
    const auth = await AuthClient.session();
    const { access_token, expires_in_sec } = await auth.generateAuthToken("functions");
    return {
      accessToken: access_token,
      refreshAt: Date.now() + expires_in_sec * 1000 - AuthClient.TOKEN_REFRESH_MARGIN_MS,
    };
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
