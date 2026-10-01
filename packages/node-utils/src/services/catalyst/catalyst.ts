import type { zcAuth } from "@zcatalyst/auth";
import type { CatalystScope } from "@/enums/catalyst-scope";
import { CatalystError } from "@/errors/catalyst-error";

export type CatalystApp = Awaited<ReturnType<typeof zcAuth.init>>;

/** The request's Catalyst apps, one per scope, each built from the request's headers. */
export class Catalyst {
  private readonly apps = new Map<CatalystScope, CatalystApp>();

  setApp(scope: CatalystScope, app: CatalystApp): void {
    this.apps.set(scope, app);
  }

  /** Throws when this request has no app for the scope. */
  getApp(scope: CatalystScope): CatalystApp {
    const app = this.apps.get(scope);
    if (app === undefined) {
      throw CatalystError.ScopeUnavailable(scope);
    }
    return app;
  }
}
