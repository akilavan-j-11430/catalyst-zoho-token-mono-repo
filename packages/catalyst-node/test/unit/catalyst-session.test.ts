import { describe, expect, it } from "vitest";
import { AsyncContextError } from "@repo/async-context/async-context-error";
import { ExecutionContext, runWithContext } from "@repo/async-context/async-context";
import { catalystAuth } from "@repo/testing/catalyst-auth";
import { CatalystSession } from "@/catalyst-session";
import { CatalystScope } from "@/catalyst-scope";
import { ErrorCode } from "@/error-codes";
import { CatalystError } from "@/catalyst-error";

const requestHeaders = { "x-zc-projectid": "1", "x-zc-user-cred-token": "secret-token" };

/** Runs `call` inside a fresh execution context, as an entry point does. */
function inContext<T>(call: () => Promise<T>): Promise<T> {
  return runWithContext(new ExecutionContext({ executionId: "test-execution", extras: {} }), call);
}

describe("CatalystSession.setApp", () => {
  it("builds the scope's app from the request headers and sets it on the context", async () => {
    const app = await inContext(async () => {
      await CatalystSession.setApp(requestHeaders, CatalystScope.User);
      return CatalystSession.app(CatalystScope.User);
    });

    expect(app).toBeDefined();
    expect(catalystAuth.init).toHaveBeenCalledExactlyOnceWith(
      { headers: requestHeaders },
      { scope: CatalystScope.User },
    );
  });

  it("rejects with SCOPE_UNAVAILABLE carrying the SDK's code and message, never its headers", async () => {
    catalystAuth.init.mockRejectedValue(
      Object.assign(new Error("User not authenticated"), {
        code: "app/AUTH_ERROR",
        value: requestHeaders,
        toString: () => JSON.stringify({ code: "app/AUTH_ERROR", value: requestHeaders }),
      }),
    );

    const setting = inContext(() => CatalystSession.setApp(requestHeaders, CatalystScope.User));

    const failure: unknown = await setting.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CatalystError);
    expect(failure).toMatchObject({ code: ErrorCode.SCOPE_UNAVAILABLE, cause: undefined });
    expect(String(failure)).toContain("app/AUTH_ERROR - User not authenticated");
    expect(String(failure)).not.toContain("secret-token");
  });
});

describe("CatalystSession.app", () => {
  it("throws SCOPE_UNAVAILABLE for a scope the entry point did not set", async () => {
    const reading = inContext(async () => {
      await CatalystSession.setApp(requestHeaders, CatalystScope.Admin);
      return CatalystSession.app(CatalystScope.User);
    });

    await expect(reading).rejects.toMatchObject({ code: ErrorCode.SCOPE_UNAVAILABLE });
  });

  it("is not shared between execution contexts", async () => {
    await inContext(() => CatalystSession.setApp(requestHeaders, CatalystScope.User));

    const reading = inContext(async () => CatalystSession.app(CatalystScope.User));

    await expect(reading).rejects.toMatchObject({ code: ErrorCode.SCOPE_UNAVAILABLE });
  });

  it("throws outside an execution context", () => {
    expect(() => CatalystSession.app(CatalystScope.User)).toThrow(AsyncContextError);
  });
});
