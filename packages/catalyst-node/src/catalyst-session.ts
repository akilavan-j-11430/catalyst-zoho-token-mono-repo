import { zcAuth } from "@zcatalyst/auth";
import { currentContext } from "@repo/async-context/async-context";
import type { CatalystScope } from "@/catalyst-scope";
import { CatalystError } from "@/catalyst-error";

export type CatalystApp = Awaited<ReturnType<typeof zcAuth.init>>;

/** The headers Catalyst stamps on a request: its project details and the caller's
 *  credentials. An Express `req.headers` and `Object.fromEntries(await headers())` both fit. */
export type CatalystHeaders = Readonly<Record<string, string | string[] | number | undefined>>;

type InitInput = Parameters<typeof zcAuth.init>[0];

/**
 * The request's Catalyst apps, one per scope, held on its execution context. The entry point
 * sets the app for each scope it needs, once, and every wrapper reads it from there. An app
 * carries the caller's credentials, so it belongs to exactly one request and is never held at
 * module scope.
 */
export class CatalystSession {
  /** Where an execution context carries its apps. */
  private static readonly CONTEXT_KEY = "catalystApps";

  /** Builds the app for the scope from the request's headers and sets it on the execution
   *  context in flight. Rejects with `SCOPE_UNAVAILABLE` when the headers cannot build it -
   *  for User, when the request carries no signed-in user. */
  static async setApp(headers: CatalystHeaders, scope: CatalystScope): Promise<void> {
    const apps = CatalystSession.appsInContext();
    apps.set(scope, await CatalystSession.build(headers, scope));
  }

  /** The app the entry point set for the scope. Throws `SCOPE_UNAVAILABLE` when it set none,
   *  and outside an execution context. */
  static app(scope: CatalystScope): CatalystApp {
    const app = CatalystSession.appsInContext().get(scope);
    if (app === undefined) {
      throw CatalystError.ScopeUnavailable(scope, "the entry point did not set this scope up");
    }
    return app;
  }

  private static appsInContext(): Map<CatalystScope, CatalystApp> {
    const { manager } = currentContext();
    let apps = manager.getExtras<Map<CatalystScope, CatalystApp>>(CatalystSession.CONTEXT_KEY);
    if (apps === undefined) {
      apps = new Map();
      manager.setExtras(CatalystSession.CONTEXT_KEY, apps);
    }
    return apps;
  }

  // `init` loads its implementation through a dynamic import, so it must be awaited.
  private static async build(headers: CatalystHeaders, scope: CatalystScope): Promise<CatalystApp> {
    try {
      return await zcAuth.init({ headers } as unknown as InitInput, { scope });
    } catch (cause) {
      throw CatalystError.ScopeUnavailable(scope, CatalystSession.describeInitFailure(cause));
    }
  }

  /** The SDK's init error carries the request headers - credential tokens included - in its
   *  `value`, which its `toString` and `toJSON` both print. So only its code and message are
   *  kept, and the error itself is never attached as a cause. */
  private static describeInitFailure(cause: unknown): string {
    if (!(cause instanceof Error)) {
      return "unknown failure";
    }
    const code = "code" in cause ? String(cause.code) : cause.name;
    return `${code} - ${cause.message}`;
  }
}
