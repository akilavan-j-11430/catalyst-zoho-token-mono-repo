import config, { allowTestTooling } from "@repo/eslint-config";

// This package is test tooling, so its src/ imports Vitest. Nothing outside test/ imports it.
export default [...config, allowTestTooling(["src/**/*.ts"])];
