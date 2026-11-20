import config, { allowTestsIn, allowVendorNames } from "@repo/eslint-config";

// zoho-accounts.ts is the Zoho accounts server's seam, so Zoho's snake_case stays there.
export default [
  ...config,
  allowVendorNames(["src/zoho-accounts.ts"]),
  allowTestsIn(["unit", "integration"]),
];
