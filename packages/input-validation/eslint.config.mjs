import config, { allowTestsIn } from "@repo/eslint-config";

export default [...config, allowTestsIn(["unit"])];
