import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import {
  allowCatalystSdk,
  camelCaseNamingRule,
  testFileBan,
  webImportBan,
} from "@repo/eslint-config";

const FETCH_MESSAGE =
  "Read in a Server Component or write in a Server Action - see .claude/rules/nextjs/code-placement.md.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The browser never calls our own API: pages read on the server and forms write through
  // Server Actions. An outside service is reached from the server through HttpClient.
  // See `.claude/rules/nextjs/code-placement.md`.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message: FETCH_MESSAGE,
        },
      ],
      // `no-restricted-globals` matches bare identifiers only, so `window.fetch`
      // and `globalThis.fetch` walk straight past it.
      "no-restricted-properties": [
        "error",
        { object: "window", property: "fetch", message: FETCH_MESSAGE },
        { object: "globalThis", property: "fetch", message: FETCH_MESSAGE },
      ],
    },
  },
  // camelCase everywhere except src/catalyst/, the seam where the Catalyst web SDK's
  // `email_id` is read before it is mapped, src/env.ts, whose keys are environment variable
  // names, and the vendored shadcn primitives in src/components/ui/.
  // See `.claude/rules/general/readable-code.md`.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/catalyst/**", "src/env.ts", "src/components/ui/**"],
    rules: camelCaseNamingRule,
  },
  // No test runner here yet, so every test file is rejected rather than silently never run.
  // See `.claude/rules/general/testing.md`.
  testFileBan,
  // The Catalyst SDK only through @repo/catalyst-node, outside services only through
  // HttpClient, and no test tooling in what ships. src/catalyst/ is the one seam allowed the
  // Catalyst web SDK. See `.claude/rules/general/catalyst-sdk.md`.
  webImportBan,
  allowCatalystSdk(["src/catalyst/**"]),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
