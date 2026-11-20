import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@repo/types/user";
import { UserManagement } from "@/user-management";
import { ErrorCode } from "@/error-codes";
import { CatalystError } from "@/catalyst-error";
import { inRequest } from "../in-request";

// The SDK is replaced before user-management.ts loads it, so no call leaves the process.
const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

// This replaces test/setup.ts's mock of the same module, so it fakes `zcAuth` too.
vi.mock("@zcatalyst/auth", async () => {
  const { catalystAuth } = await import("@repo/testing/catalyst-auth");
  return {
    zcAuth: catalystAuth,
    UserManagement: class {
      getCurrentUser = getCurrentUser;
    },
  };
});

/** Reads the user the way a route would, inside the request's execution context. */
function readAsUser(): Promise<CurrentUser> {
  return inRequest(() => UserManagement.currentUser());
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

  it("asks Catalyst once per execution, however often it is called", async () => {
    getCurrentUser.mockResolvedValue({ user_id: "7", email_id: "asha@example.com" });

    const [first, second] = await inRequest(async () => [
      await UserManagement.currentUser(),
      await UserManagement.currentUser(),
    ]);

    expect(second).toEqual(first);
    expect(getCurrentUser).toHaveBeenCalledOnce();
  });

  it("turns an SDK failure into a CatalystError", async () => {
    getCurrentUser.mockRejectedValue(new Error("no user credentials present"));

    const reading = readAsUser();

    await expect(reading).rejects.toBeInstanceOf(CatalystError);
    await expect(reading).rejects.toMatchObject({ code: ErrorCode.INVALID_RESOURCE });
  });
});
