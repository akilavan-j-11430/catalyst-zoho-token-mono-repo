import config, {
  allowCatalystSdk,
  allowTestsIn,
  allowVendorNames,
} from "@repo/eslint-config";

// catalyst/ is the only place a Catalyst SDK may be imported;
// catalyst/ and repositories/ are the Catalyst seams and services/zoho/accounts.ts the Zoho
// accounts one, so each vendor's casing stays there. The env test declares a variable name,
// which is UPPER_SNAKE like any env key.
export default [
  ...config,
  allowCatalystSdk(["src/catalyst/*.ts"]),
  allowVendorNames([
    "src/catalyst/*.ts",
    "src/repositories/*.ts",
    "src/services/zoho/accounts.ts",
    "test/unit/utils/env.test.ts",
  ]),
  allowTestsIn(["unit", "integration"]),
];
