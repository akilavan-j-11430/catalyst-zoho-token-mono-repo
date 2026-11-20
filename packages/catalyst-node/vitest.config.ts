import { VitestProjects } from "@repo/testing/vitest-projects";
import { mergeConfig } from "vitest/config";

export default mergeConfig(VitestProjects.forWorkspace(import.meta.dirname), {
  test: { setupFiles: ["./test/setup.ts"] },
});
