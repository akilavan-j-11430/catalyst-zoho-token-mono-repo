import config, { allowCatalystSdk, allowTestsIn } from "@repo/eslint-config";

// The per-request initialization in middleware.ts is the one place outside node-utils'
// catalyst/ that touches the SDK: it builds each request's apps from its headers.
export default [...config, allowCatalystSdk(["src/middleware.ts"]), allowTestsIn(["unit"])];
