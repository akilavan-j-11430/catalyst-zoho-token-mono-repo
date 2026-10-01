import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const FETCH_MESSAGE =
  "Call the API through src/services/ - see .claude/rules/web-data-access.md.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // `src/services/api/client.ts` is the only place that speaks HTTP, the way
  // `services/catalyst/` is the only place that reaches Catalyst. Prose drifts; this
  // does not.
  // See `.claude/rules/web-data-access.md`.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/services/api/client.ts"],
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
