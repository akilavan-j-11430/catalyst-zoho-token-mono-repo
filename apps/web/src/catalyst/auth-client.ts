import type { Authentication } from "@zcatalyst/auth/web";
import { AppUrl } from "@/lib/app-url";

/**
 * Facade: everything this app asks of the Catalyst web SDK - showing the sign-in form and
 * signing out. The only code in the browser that reaches it, and the SDK's objects never leave
 * it: callers pass paths and get nothing of the SDK's back. Who is signed in is read on the
 * server, by the page that shows them.
 */
export class AuthClient {
  private static pendingSession: Promise<Authentication> | null = null;

  /** Renders Catalyst's sign-in form into the element with `containerId`, styled by the
   *  stylesheet at `paths.stylesheet`, and sends the person to `paths.afterSignIn` once
   *  signed in.
   *
   *  Every URL handed to the SDK is resolved inside Catalyst's own iframe and by its redirect
   *  endpoint, neither of which shares this app's origin, so a bare path would resolve against
   *  theirs - hence `AppUrl.absolute` on each one, here and in `signOut`. */
  static async showSignIn(
    containerId: string,
    paths: { afterSignIn: string; stylesheet: string },
  ): Promise<void> {
    const auth = await AuthClient.session();
    await auth.signIn(containerId, {
      redirectUrl: AppUrl.absolute(paths.afterSignIn),
      cssUrl: AppUrl.absolute(paths.stylesheet),
    });
  }

  /** Signs out and sends the browser to `path`. */
  static async signOut(path: string): Promise<void> {
    const auth = await AuthClient.session();
    await auth.signOut(AppUrl.absolute(path));
  }

  /**
   * The SDK reads `document` when its module is evaluated, which would crash the server
   * prerender of any component importing it, so it is pulled in on first use instead.
   * Holding the promise also makes `init` happen once - the SDK's own credential fetch
   * clears its in-flight promise in a `finally`, so concurrent callers each re-request.
   */
  private static session(): Promise<Authentication> {
    if (AuthClient.pendingSession === null) {
      AuthClient.pendingSession = import("@zcatalyst/auth/web").then(async ({ zcAuth }) => {
        await zcAuth.init();
        return zcAuth;
      });
    }
    return AuthClient.pendingSession;
  }
}
