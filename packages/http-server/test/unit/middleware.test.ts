import type { Request, Response } from "express";
import { describe, expect, it, vi, type Mock } from "vitest";
import { Catalyst } from "@repo/node-utils/catalyst/catalyst";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { ExecutionContext, runWithContext } from "@repo/node-utils/framework/async-context";
import { catalystAuth } from "@repo/testing/catalyst-auth";
import { HttpError } from "@/http-error";
import { initCatalystScopes } from "@/middleware";

interface ScopeGuardRun {
  catalyst: Catalyst;
  next: Mock<() => void>;
  finished: Promise<void>;
}

/** Runs `initCatalystScopes` the way Express would: inside the request's execution context. */
function runScopeGuard(scopes: CatalystScope[]): ScopeGuardRun {
  const catalyst = new Catalyst();
  const next = vi.fn<() => void>();
  const context = new ExecutionContext({ executionId: "execution-1", catalyst, extras: {} });
  const finished = runWithContext(context, () =>
    initCatalystScopes(scopes)({} as Request, {} as Response, next),
  );
  return { catalyst, next, finished: Promise.resolve(finished) };
}

describe("initCatalystScopes", () => {
  it("builds the app for each listed scope, then continues", async () => {
    const { catalyst, next, finished } = runScopeGuard([CatalystScope.User]);

    await finished;

    expect(catalyst.getApp(CatalystScope.User)).toEqual({});
    expect(next).toHaveBeenCalledOnce();
  });

  it("answers 401 when the User app cannot be built", async () => {
    catalystAuth.init.mockRejectedValue(new Error("missing user credentials"));

    const { next, finished } = runScopeGuard([CatalystScope.User]);

    await expect(finished).rejects.toBeInstanceOf(HttpError);
    await expect(finished).rejects.toMatchObject({ status: 401 });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes an Admin failure through unchanged, which errorHandler turns into a 500", async () => {
    const cause = new Error("app/invalid_project_details");
    catalystAuth.init.mockRejectedValue(cause);

    const { finished } = runScopeGuard([CatalystScope.Admin]);

    await expect(finished).rejects.toBe(cause);
  });
});
