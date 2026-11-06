import { vi } from "vitest";

// No test request carries the headers `catalyst serve` injects, so `zcAuth` is faked for
// every test in this workspace. The rest of the SDK module stays real. Control the fake
// through `catalystAuth` from `@repo/testing/catalyst-auth`.
vi.mock("@zcatalyst/auth", async (importOriginal) => {
  const { catalystAuth } = await import("@repo/testing/catalyst-auth");
  return { ...(await importOriginal<Record<string, unknown>>()), zcAuth: catalystAuth };
});
