import { join } from "node:path";
import type { ViteUserConfig } from "vitest/config";

/**
 * The Vitest settings every tested workspace starts from: a `unit` and an `integration`
 * project, the `@/` alias to the workspace's `src/`, and the reset before each test.
 * `.claude/rules/testing.md` is the full rule.
 *
 * Factory: each workspace's `vitest.config.ts` builds its settings here, so they are written
 * once.
 */
export class VitestProjects {
  static forWorkspace(workspaceRoot: string): ViteUserConfig {
    return {
      resolve: {
        alias: { "@": join(workspaceRoot, "src") },
      },
      test: {
        // The logger writes a block per call; show it only for a test that failed.
        silent: "passed-only",
        // Every spy is cleared and every vi.stubEnv undone before each test, so no test
        // inherits another's state and none has to remember to clean up.
        mockReset: true,
        unstubEnvs: true,
        // Lint allows these same folders with `allowTestsIn` (@repo/eslint-config); change
        // both together, or lint approves files Vitest no longer runs.
        projects: [
          // `extends: true` makes each project inherit everything above - the alias, the
          // reset, and any `setupFiles` a workspace merges in. Without it they are lost.
          { extends: true, test: { name: "unit", include: ["test/unit/**/*.test.ts"] } },
          {
            extends: true,
            test: { name: "integration", include: ["test/integration/**/*.test.ts"] },
          },
        ],
      },
    };
  }
}
