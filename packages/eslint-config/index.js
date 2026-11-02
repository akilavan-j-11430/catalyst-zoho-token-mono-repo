import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const USE_HTTP_CLIENT =
  "Use HttpClient from @repo/node-utils/http/http-client. See .claude/rules/outbound-http.md.";
const USE_CATALYST_PACKAGE =
  "Call Catalyst through @repo/node-utils/catalyst/*. See .claude/rules/catalyst-sdk.md.";

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

// camelCase for everything this repo names. A vendor's casing (`email_id`, `ROWID`) is
// allowed only in the files that talk to that vendor - see allowVendorCasing and
// .claude/rules/readable-code.md.
const camelCaseNaming = [
  "error",
  { selector: "default", format: ["camelCase"], leadingUnderscore: "allow" },
  { selector: "import", format: ["camelCase", "PascalCase"] },
  // PascalCase for React components and classes held in a const, UPPER_CASE for constants.
  {
    selector: "variable",
    format: ["camelCase", "PascalCase", "UPPER_CASE"],
    leadingUnderscore: "allow",
  },
  { selector: "function", format: ["camelCase", "PascalCase"] },
  // Static factories read as constructors: HttpError.BadRequest(...).
  { selector: "classMethod", modifiers: ["static"], format: ["camelCase", "PascalCase"] },
  { selector: "typeLike", format: ["PascalCase"] },
  { selector: "enumMember", format: ["PascalCase", "UPPER_CASE"] },
  // Static constants on a class follow the UPPER_CASE convention.
  { selector: "classProperty", modifiers: ["static", "readonly"], format: ["camelCase", "UPPER_CASE"] },
  { selector: "objectLiteralProperty", format: ["camelCase", "PascalCase", "UPPER_CASE"] },
  // Header names, CSS variables and other keys that need quotes are wire strings, not our names.
  { selector: "objectLiteralProperty", modifiers: ["requiresQuotes"], format: null },
  { selector: "typeProperty", modifiers: ["requiresQuotes"], format: null },
];

/** The naming rule, for a workspace whose config is not built on this one (apps/web). */
export const camelCaseNamingRule = { "@typescript-eslint/naming-convention": camelCaseNaming };

/** Lifts the camelCase rule for the vendor seams, where the wire shape keeps the vendor's
 *  casing until it is mapped. Applied per workspace for the same reason as allowCatalystSdk. */
export function allowVendorCasing(files) {
  return { files, rules: { "@typescript-eslint/naming-convention": "off" } };
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
      "@typescript-eslint/naming-convention": camelCaseNaming,
    },
  },
  {
    // The transports are the seam HttpClient sits on, so they use the real thing.
    files: ["**/http/*-transport.ts"],
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
