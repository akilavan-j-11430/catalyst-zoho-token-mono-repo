import type { Authentication } from "@zcatalyst/auth/web";

interface AuthToken {
  accessToken: string;
  /** Asked for again from here on, while the old one still has a minute to live. */
  refreshAt: number;
}

/**
 * Facade: everything this app asks of the Catalyst web SDK - the session, sign-out, the API
 * token, and the URLs handed to the SDK. The only code in this app that reaches it. Who is
 * signed in comes from the api (`MeService`), not from here.
 */
export class AuthClient {
  private static readonly TOKEN_REFRESH_MARGIN_MS = 60_000;

  private static pendingSession: Promise<Authentication> | null = null;
  /** The token in use. Kept apart from the request for the next one, so an expired token
   *  is replaced before it is sent rather than after. */
  private static heldToken: AuthToken | null = null;
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

  /**
   * The caller's credential for `apps/api`. Slate and AppSail are separate origins, so the
   * session cookie never reaches the API and this bearer token carries the user instead.
   * One token serves every call until it nears expiry - each issue is two Catalyst round
   * trips - and concurrent callers share the one in flight. It needs a session, so only
   * the client for signed-in routes resolves it.
   */
  static async authHeaders(): Promise<Record<string, string>> {
    const token = await AuthClient.currentAuthToken();
    return { authorization: `Bearer ${token.accessToken}` };
  }

  /**
   * Signs out, revoking the API token first. The SDK's own sign-out revokes only a token it
   * stores itself, so ours would otherwise stay valid until it expires. A token still being
   * issued is waited for, so it is revoked too. A failed revoke is swallowed so sign-out
   * still completes, as the SDK does for its own token.
   */
  static async signOut(path: string): Promise<void> {
    const auth = await AuthClient.session();
    const token = (await AuthClient.pendingToken?.catch(() => null)) ?? AuthClient.heldToken;
    AuthClient.heldToken = null;
    if (token) {
      await auth.revokeAccessToken(token.accessToken).catch(() => undefined);
    }
    await auth.signOut(AuthClient.appUrl(path));
  }

  /** The held token while it has time left, else a new one. Concurrent callers share one
   *  request, and a failed request is cleared so the next call tries again. */
  private static async currentAuthToken(): Promise<AuthToken> {
    const held = AuthClient.heldToken;
    if (held !== null && Date.now() < held.refreshAt) {
      return held;
    }
    AuthClient.pendingToken ??= AuthClient.issueAuthToken();
    try {
      AuthClient.heldToken = await AuthClient.pendingToken;
      return AuthClient.heldToken;
    } finally {
      AuthClient.pendingToken = null;
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
}
