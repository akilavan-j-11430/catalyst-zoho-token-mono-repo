import { build } from "esbuild";
import { copyFile, mkdir, rm, writeFile, readFile } from "fs/promises";
import { exec } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const execAsync = promisify(exec);

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "../../appsails/api");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const packageJsonFile = JSON.parse(
  await readFile(join(root, "package.json"), "utf-8"),
);

const dependencies = Object.fromEntries(
  Object.entries(packageJsonFile.dependencies).filter(
    ([name]) => !name.startsWith("@repo/"),
  ),
);

const packageJson = {
  name: packageJsonFile.name,
  version: packageJsonFile.version,
  main: "index.js",
  dependencies,
};

await build({
  entryPoints: [join(root, "src/index.ts")],
  outfile: join(outDir, "index.js"),
  bundle: true,
  external: Object.keys(dependencies),
  platform: "node",
  target: "node24",
  format: "cjs",
});

await Promise.all([
  writeFile(join(outDir, "package.json"), JSON.stringify(packageJson, null, 2)),
  copyFile(join(root, "app-config.json"), join(outDir, "app-config.json")),
]);

const { stderr } = await execAsync("npm install --omit=dev", { cwd: outDir });
if (stderr) process.stderr.write(stderr);
