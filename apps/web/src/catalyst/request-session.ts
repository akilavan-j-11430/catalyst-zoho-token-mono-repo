/** Adapter: reads the session Catalyst stamps on each request to this app. */
export class RequestSession {
  /**
   * Catalyst stamps every request with `x-zc-user-type` - `catalyst serve` locally, Slate
   * when deployed. A signed-in app user is `project-user`; an anonymous visitor on Slate is
   * `admin`, so only an exact match counts. The same request carries Catalyst credentials
   * in other `x-zc-*` headers, so never log or echo the headers this reads from.
   */
  static isSignedIn(requestHeaders: Headers): boolean {
    return requestHeaders.get("x-zc-user-type") === "project-user";
  }
}
