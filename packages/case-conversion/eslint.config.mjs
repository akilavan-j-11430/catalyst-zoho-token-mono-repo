import config, { allowTestsIn, allowVendorNames } from "@repo/eslint-config";

// The camel-case tests feed in vendor-cased keys, which is the input under test.
export default [
  ...config,
  allowVendorNames(["test/unit/camel-case.test.ts"]),
  allowTestsIn(["unit"]),
];
