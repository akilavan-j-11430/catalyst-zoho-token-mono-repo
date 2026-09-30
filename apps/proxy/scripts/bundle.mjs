import { build } from "esbuild";
import { copyFile, mkdir, rm, writeFile } from "fs/promises";
import { exec } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const execAsync = promisify(exec);

const here = dirname(fileURLToPath(import.meta.url));
const proxyRoot = join(here, "..");
const outDir = join(proxyRoot, "../../appsails/proxy");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [join(proxyRoot, "src/index.ts")],
  outfile: join(outDir, "index.js"),
  bundle: true,
  packages: "external",
  platform: "node",
  target: "node24",
  format: "cjs",
});

const packageJson = {
  name: "proxy",
  version: "1.0.0",
  main: "index.js",
  dependencies: {
    express: "latest",
    "http-proxy-middleware": "latest",
  },
};

await Promise.all([
  writeFile(join(outDir, "package.json"), JSON.stringify(packageJson, null, 2)),
  copyFile(join(proxyRoot, "app-config.json"), join(outDir, "app-config.json")),
]);

const { stderr } = await execAsync("npm install", { cwd: outDir });
if (stderr) process.stderr.write(stderr);
