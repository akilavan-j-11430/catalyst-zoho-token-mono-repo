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

const KEEP_TEST_TOOLING_IN_TESTS =
  "Test tooling stays under test/ - see .claude/rules/testing.md. Bundled into src/, it ships.";

const testToolingImports = ["vitest", "supertest", "@repo/testing"].map((name) => ({
  name,
  message: KEEP_TEST_TOOLING_IN_TESTS,
}));

const testToolingPatterns = [
  { group: ["vitest/*", "@vitest/*", "@repo/testing/*"], message: KEEP_TEST_TOOLING_IN_TESTS },
];

// One rule per file wins in flat config - a second `no-restricted-imports` block would
// replace this one wholesale rather than adding to it, so every restriction is composed
// here and the exemptions below re-state what still applies.
function restrictedImports({
  allowCatalystSdk = false,
  allowTestTooling = false,
  allowNodeHttp = false,
  allowHttpClients = false,
} = {}) {
  const httpClients = allowHttpClients
    ? []
    : allowNodeHttp
      ? httpClientImports.filter(({ name }) => name !== "http" && name !== "node:http")
      : httpClientImports;
  return [
    "error",
    {
      paths: [
        ...httpClients,
        ...(allowCatalystSdk ? [] : catalystSdkImports),
        ...(allowTestTooling ? [] : testToolingImports),
      ],
      patterns: [
        ...(allowCatalystSdk ? [] : catalystSdkPatterns),
        ...(allowTestTooling ? [] : testToolingPatterns),
      ],
    },
  ];
}

// camelCase for everything this repo names. A vendor's casing (`email_id`, `ROWID`) is
// allowed only in the files that talk to that vendor - see allowVendorNames and
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

/** Turns the camelCase rule off for the given files, so names a vendor defines keep its
 *  spelling - `email_id`, `ROWID`, `AUTH_REDIRECT_URL`. Meant for the vendor seams, where the
 *  wire shape is read before it is mapped, and for a test whose input is such a name.
 *  Applied per workspace for the same reason as allowCatalystSdk. */
export function allowVendorNames(files) {
  return { files, rules: { "@typescript-eslint/naming-convention": "off" } };
}

/**
 * Lifts the Catalyst SDK ban for the given files, keeping every other restriction - the HTTP
 * clients and the test tooling stay banned.
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

/** Lifts the test-tooling ban for the given files, keeping every other restriction. Tests
 *  get it by default; @repo/testing applies it to its own src/, which is test tooling. */
export function allowTestTooling(files) {
  return {
    files,
    rules: { "no-restricted-imports": restrictedImports({ allowTestTooling: true }) },
  };
}

/**
 * Rejects every test-like file. A workspace that runs Vitest re-allows the folders its scripts
 * run with `allowTestsIn(["unit", ...])`; anything else - a `.spec.ts`, a `.test.mts`, one
 * under src/, any test in a workspace with no runner - would silently never run, and under
 * src/ it would also be compiled into dist/. Exported for apps/web, whose config is built on
 * Next's rather than this one.
 *
 * It rides on `no-restricted-syntax`, and one rule per file wins in flat config: a later
 * block that sets that rule for test files would replace this one, so compose it here.
 */
export const testFileBan = {
  files: ["**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "Program",
        message:
          "A test is a *.test.ts file under test/unit/ or test/integration/ of a workspace " +
          "that runs that kind - see .claude/rules/testing.md.",
      },
    ],
  },
};

/**
 * Allows `*.test.ts` files in the given folders under test/ - pass exactly the ones the
 * workspace has a `test:<folder>` script for, `["unit"]` or `["unit", "integration"]`, so a
 * test in a folder nobody runs stays a lint error. The globs must match the projects in
 * `VitestProjects.forWorkspace` (@repo/testing/vitest-projects); ESLint loads plain JS and cannot import
 * that TypeScript source, so the two are kept in step by hand.
 */
export function allowTestsIn(kinds) {
  return {
    files: kinds.map((kind) => `test/${kind}/**/*.test.ts`),
    rules: { "no-restricted-syntax": "off" },
  };
}

/** The test-tooling import ban on its own, for apps/web, whose config is built on Next's. */
export const testToolingBan = {
  files: ["src/**/*.{ts,tsx,mts,cts}"],
  rules: {
    "no-restricted-imports": [
      "error",
      { paths: testToolingImports, patterns: testToolingPatterns },
    ],
  },
};

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
    // Every TypeScript extension: a CommonJS workspace writes ESM as .mts, and a ban that
    // skipped it would let anything through.
    files: ["**/*.{ts,mts,cts,tsx}"],
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
    // The transports are the seam HttpClient sits on, so they use the real thing - fetch, an
    // undici dispatcher, or a client like axios in a new transport.
    files: ["**/http/*-transport.ts"],
    rules: {
      "no-restricted-globals": "off",
      "no-restricted-imports": restrictedImports({ allowHttpClients: true }),
    },
  },
  // Tests and their config are the only code that may import test tooling.
  allowTestTooling(["test/**/*.{ts,mts,cts}", "vitest.config.{ts,mts}"]),
  {
    // An integration test may stand up a fake upstream with node:http, and nothing else
    // changes: every other HTTP client and the Catalyst SDK stay banned. A test mocks the
    // SDK with vi.mock, which names it as a string, not an import.
    files: ["test/integration/**/*.{ts,mts,cts}"],
    rules: {
      "no-restricted-imports": restrictedImports({ allowTestTooling: true, allowNodeHttp: true }),
    },
  },
  testFileBan,
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
