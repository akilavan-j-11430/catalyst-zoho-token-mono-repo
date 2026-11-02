import config, { allowCatalystSdk, allowVendorCasing } from "@repo/eslint-config";

// Only the per-request initialization touches the SDK directly. Environment variable names
// and the AppSail log record keep their own casing.
export default [
  ...config,
  allowCatalystSdk(["src/middleware.ts"]),
  allowVendorCasing(["src/env.ts", "src/framework/catalyst-logger.ts"]),
];
