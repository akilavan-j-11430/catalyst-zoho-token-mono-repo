import config, { allowCatalystSdk } from "@repo/eslint-config";

// Only the per-request initialization touches the SDK directly.
export default [...config, allowCatalystSdk(["src/middleware.ts"])];
