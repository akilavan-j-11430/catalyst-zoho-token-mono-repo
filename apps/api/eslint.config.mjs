import config, { allowTestsIn, allowVendorNames } from "@repo/eslint-config";

// Environment variable names and the AppSail log record keep their own casing.
export default [
  ...config,
  allowVendorNames(["src/env.ts", "src/framework/catalyst-logger.ts"]),
  allowTestsIn(["integration"]),
];
