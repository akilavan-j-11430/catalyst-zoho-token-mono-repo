import { VitestProjects } from "@repo/testing/vitest-projects";
import { mergeConfig } from "vitest/config";

export default mergeConfig(VitestProjects.forWorkspace(import.meta.dirname), {
  test: {
    setupFiles: ["./test/setup.ts"],
    // zoho-connections.ts reads these at module scope, so they must exist before any test
    // file imports the app. Keys read per request are stubbed by the test that needs them.
    env: {
      ZOHO_TOKEN_ACCOUNTS_URL: "https://accounts.example.com",
      ZOHO_TOKEN_CLIENT_ID: "test-client-id",
      ZOHO_TOKEN_CLIENT_SECRET: "test-client-secret",
    },
  },
});
