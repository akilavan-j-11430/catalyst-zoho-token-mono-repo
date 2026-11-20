import config, { allowTestsIn, allowVendorNames } from "@repo/eslint-config";

// Catalyst's log record names its timestamp `_zl_timestamp`, in the output and in its test.
export default [
  ...config,
  allowVendorNames(["src/catalyst-log-output.ts", "test/unit/catalyst-log-output.test.ts"]),
  allowTestsIn(["unit"]),
];
