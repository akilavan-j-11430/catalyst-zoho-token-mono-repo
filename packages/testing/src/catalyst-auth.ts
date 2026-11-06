import { vi } from "vitest";

/**
 * Stand-in for `zcAuth` from `@zcatalyst/auth`, swapped in for every test by each
 * workspace's `test/setup.ts`.
 * The real `init` reads project details and credentials from headers only `catalyst serve`
 * injects, so a test request never has them. This `init` resolves an empty app instead, and
 * `mockReset` restores that default before every test.
 *
 * A test makes it fail with `catalystAuth.init.mockRejectedValue(...)`.
 */
export const catalystAuth = {
  init: vi.fn(async (): Promise<object> => ({})),
};
