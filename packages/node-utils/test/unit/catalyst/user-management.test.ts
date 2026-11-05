import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@repo/types/user";
import { Catalyst, type CatalystApp } from "@/catalyst/catalyst";
import { UserManagement } from "@/catalyst/user-management";
import { CatalystScope } from "@/enums/catalyst-scope";
import { ErrorCode } from "@/enums/error-codes";
import { CatalystError } from "@/errors/catalyst-error";
import { ExecutionContext, runWithContext } from "@/framework/async-context";

// The SDK is replaced before user-management.ts loads it, so no call leaves the process.
const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock("@zcatalyst/auth", () => ({
  UserManagement: class {
    getCurrentUser = getCurrentUser;
  },
}));

/** Reads the user the way a route would: inside a request whose User app is built. */
function readAsUser(): Promise<CurrentUser> {
  const catalyst = new Catalyst();
  catalyst.setApp(CatalystScope.User, {} as CatalystApp);
  const context = new ExecutionContext({ executionId: "execution-1", catalyst, extras: {} });
  return runWithContext(context, () => UserManagement.currentUser());
}

describe("UserManagement.currentUser", () => {
  it("returns only the four user fields, in camelCase", async () => {
    getCurrentUser.mockResolvedValue({
      user_id: "7",
      email_id: "asha@example.com",
      first_name: "Asha",
      last_name: "Rao",
      zuid: "12345",
      org_id: "9",
      role_details: { role_id: "1", role_name: "App User" },
    });

    const signedInUser = await readAsUser();

    expect(signedInUser).toEqual({
      userId: "7",
      emailId: "asha@example.com",
      firstName: "Asha",
      lastName: "Rao",
    });
  });

  it("turns an SDK failure into a CatalystError", async () => {
    getCurrentUser.mockRejectedValue(new Error("no user credentials present"));

    const reading = readAsUser();

    await expect(reading).rejects.toBeInstanceOf(CatalystError);
    await expect(reading).rejects.toMatchObject({ code: ErrorCode.INVALID_RESOURCE });
  });
});
