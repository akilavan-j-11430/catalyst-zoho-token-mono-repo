import "server-only";
import { headers } from "next/headers";

/** URLs on this app's own origin, built on the server - `AppUrl` is the browser's. */
export class RequestUrl {
  /** `path` on the origin of the Server Action request in flight. A Server Action request
   *  always carries `Origin`, and Next has already checked it against the request's host, so
   *  it is this app's own origin - local or Slate alike. */
  static async absolute(path: string): Promise<string> {
    const origin = (await headers()).get("origin");
    if (origin === null) {
      throw new Error("A Server Action request arrived without an Origin header.");
    }
    return new URL(path, origin).toString();
  }
}
