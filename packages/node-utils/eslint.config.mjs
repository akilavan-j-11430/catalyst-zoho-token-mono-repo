import config, { allowCatalystSdk, allowVendorCasing } from "@repo/eslint-config";

// catalyst/ is the only place a Catalyst SDK may be imported;
// catalyst.ts is the per-request holder of the scoped apps.
// catalyst/ and repositories/ are the Catalyst seams and services/zoho/accounts.ts the Zoho
// accounts one, so each vendor's casing stays there.
export default [
  ...config,
  allowCatalystSdk(["src/catalyst/*.ts"]),
  allowVendorCasing([
    "src/catalyst/*.ts",
    "src/repositories/*.ts",
    "src/services/zoho/accounts.ts",
  ]),
];
