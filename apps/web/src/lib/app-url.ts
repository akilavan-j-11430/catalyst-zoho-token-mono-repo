/** URLs on this app's own origin, built in the browser. */
export class AppUrl {
  /** `path` as an absolute URL on the origin the page was loaded from - `localhost` under
   *  `catalyst serve`, the Slate domain when deployed. Browser only: it reads
   *  `window.location`, which server code does not have. */
  static absolute(path: string): string {
    return new URL(path, window.location.origin).toString();
  }
}
