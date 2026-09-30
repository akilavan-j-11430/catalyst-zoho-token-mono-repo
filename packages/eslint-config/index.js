import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const USE_HTTP_CLIENT =
  "Use HttpClient from @repo/node-utils/http/http_client. See .claude/rules/outbound_http.md.";
const USE_CATALYST_PACKAGE =
  "Call Catalyst through @repo/node-utils/services/catalyst/*. See .claude/rules/catalyst_sdk.md.";

// Exact specifiers, not patterns: a "http" pattern is glob-matched and would also
// reject every import under an http/ directory.
const httpClientImports = [
  "axios",
  "node-fetch",
  "got",
  "undici",
  "ky",
  "superagent",
  "http",
  "https",
  "node:http",
  "node:https",
].map((name) => ({ name, message: USE_HTTP_CLIENT }));

const catalystSdkImports = [
  { name: "zcatalyst-sdk-node", message: USE_CATALYST_PACKAGE },
];

const catalystSdkPatterns = [
  { group: ["@zcatalyst/*", "zcatalyst-sdk-node/*"], message: USE_CATALYST_PACKAGE },
];

// One rule per file wins in flat config - a second `no-restricted-imports` block would
// replace this one wholesale rather than adding to it, so every restriction is composed
// here and the exemptions below re-state what still applies.
function restrictedImports({ allowCatalystSdk = false } = {}) {
  return [
    "error",
    {
      paths: allowCatalystSdk
        ? httpClientImports
        : [...httpClientImports, ...catalystSdkImports],
      patterns: allowCatalystSdk ? [] : catalystSdkPatterns,
    },
  ];
}

/**
 * Lifts the Catalyst SDK ban for the given files, keeping every HTTP restriction.
 *
 * Each workspace applies this itself because ESLint resolves `files` against the config
 * that declares them - a repo-root glob like `packages/node-utils/**` never matches the
 * `src/...` paths a workspace-local run actually sees.
 */
export function allowCatalystSdk(files) {
  return {
    files,
    rules: { "no-restricted-imports": restrictedImports({ allowCatalystSdk: true }) },
  };
}

export default tseslint.config(
  { ignores: ["dist/**", "appsails/**", ".next/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Build scripts run in Node, outside the app's own tsconfig.
    files: ["**/*.mjs", "scripts/**"],
    languageOptions: { globals: globals.nodeBuiltin },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: USE_HTTP_CLIENT },
      ],
      "no-restricted-imports": restrictedImports(),
    },
  },
  {
    // The transports are the seam HttpClient sits on, so they use the real thing.
    files: ["**/http/*_transport.ts"],
    rules: { "no-restricted-globals": "off" },
  },
  {
    rules: {
      "no-unused-vars": "off",
      // Express mandates the 4-arg error-handler signature, so unused leading
      // params are load-bearing. The codebase marks them with a leading underscore.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
);
