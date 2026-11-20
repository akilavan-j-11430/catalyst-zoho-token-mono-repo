/** Adapter: reads the session Catalyst stamps on each request to this app. */
export class RequestSession {
  /**
   * `catalyst serve` stamps every local request with `x-zc-user-type`; that Slate does too is
   * checked on the first Slate deploy. A signed-in app user is `project-user`, and an
   * anonymous visitor may arrive as `admin`, so only an exact match counts. The same request carries Catalyst credentials
   * in other `x-zc-*` headers, so never log or echo the headers this reads from.
   */
  static isSignedIn(requestHeaders: Headers): boolean {
    return requestHeaders.get("x-zc-user-type") === "project-user";
  }
}
