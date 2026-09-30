import config, { allowCatalystSdk } from "@repo/eslint-config";

// services/catalyst/ is the only place a Catalyst SDK may be imported;
// async_context only carries the app's type across the request.
export default [
  ...config,
  allowCatalystSdk(["src/services/catalyst/*.ts"]),
];
