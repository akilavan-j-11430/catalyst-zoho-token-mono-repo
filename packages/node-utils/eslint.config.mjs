import config, { allowCatalystSdk } from "@repo/eslint-config";

// services/catalyst/ is the only place a Catalyst SDK may be imported;
// catalyst.ts is the per-request holder of the scoped apps.
export default [
  ...config,
  allowCatalystSdk(["src/services/catalyst/*.ts"]),
];
