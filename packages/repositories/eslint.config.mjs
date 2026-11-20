import config, { allowTestsIn, allowVendorNames } from "@repo/eslint-config";

// A repository is the Data Store seam, so the column names Catalyst spells in UPPER_SNAKE stay
// here, in the row types and the rows a test hands back.
export default [
  ...config,
  allowVendorNames(["src/**/*.ts", "test/unit/zoho-connection-repository.test.ts"]),
  allowTestsIn(["unit"]),
];
