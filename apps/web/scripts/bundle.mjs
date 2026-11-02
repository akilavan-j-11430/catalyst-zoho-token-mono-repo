import { access, cp, mkdir, rm, writeFile, readFile } from "fs/promises";
import { exec } from "child_process";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const execAsync = promisify(exec);

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repoRoot = join(root, "../..");
const packagesDir = join(repoRoot, "packages");
const outDir = join(repoRoot, "slate/web");

const skippedEntries = new Set([
  "node_modules",
  "dist",
  "dev-dist",
  ".next",
  ".turbo",
  "scripts",
  "turbo.json",
  // Imports @repo/eslint-config, which the staged manifest drops. Slate never lints.
  "eslint.config.mjs",
]);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await cp(root, outDir, {
  recursive: true,
  filter: (source) =>
    !skippedEntries.has(relative(root, source)) &&
    !source.endsWith(".tsbuildinfo"),
});

const packageJsonFile = JSON.parse(
  await readFile(join(root, "package.json"), "utf-8"),
);

const repoPackageNames = Object.keys(packageJsonFile.dependencies).filter(
  (name) => name.startsWith("@repo/"),
);

// Slate uploads only this directory, so a workspace package is copied in from its
// built output and installed as a `file:` dependency.
async function vendorPackage(name) {
  const folder = name.slice("@repo/".length);
  const sourceDir = join(packagesDir, folder);
  const targetDir = join(outDir, "vendor", folder);
  const manifest = JSON.parse(
    await readFile(join(sourceDir, "package.json"), "utf-8"),
  );
  // The vendored manifest keeps only what resolving an import needs, so a runtime
  // dependency would be dropped without a trace.
  if (manifest.dependencies) {
    throw new Error(`${name} declares dependencies, which vendoring would drop.`);
  }
  await access(join(sourceDir, "dist")).catch(() => {
    throw new Error(`${name} has no dist/ - build it before bundling.`);
  });
  await cp(join(sourceDir, "dist"), join(targetDir, "dist"), {
    recursive: true,
  });
  const { version, type, exports } = manifest;
  await writeFile(
    join(targetDir, "package.json"),
    JSON.stringify({ name, version, type, exports }, null, 2),
  );
  return [name, `file:./vendor/${folder}`];
}

const vendoredDependencies = Object.fromEntries(
  await Promise.all(repoPackageNames.map(vendorPackage)),
);

// Slate builds with `npm install` / `npm run build`, and npm neither understands
// `workspace:*` nor installs cleanly over a pnpm-built node_modules, so the staged app
// is a plain npm project with its own lockfile.
//
// `pnpm run` re-exports its config as `npm_config_*`, which npm reads as CLI flags - npm
// 12 rejects an inherited `allow-scripts` outright - so npm gets an environment without
// them and reads its own config files instead.
const npmEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.toLowerCase().startsWith("npm_config_"),
  ),
);

const { stdout: npmVersion } = await execAsync("npm --version", {
  env: npmEnv,
});

// npm refuses a manifest with a `workspace:*` entry, so the staged copy leaves out each
// workspace devDependency. Today that is only a lint preset, which `next build` never reads.
// `next build` does read tsconfig.json, so a dropped package named there - a tsconfig preset
// in `extends` - would break the Slate build: stop here instead.
const workspaceDevDependencies = Object.keys(packageJsonFile.devDependencies ?? {}).filter(
  (name) => packageJsonFile.devDependencies[name].startsWith("workspace:"),
);
const webTsconfig = await readFile(join(root, "tsconfig.json"), "utf-8");
const neededByBuild = workspaceDevDependencies.filter((name) => webTsconfig.includes(name));
if (neededByBuild.length > 0) {
  throw new Error(
    `tsconfig.json uses ${neededByBuild.join(", ")}, a workspace devDependency the staged copy drops, so Slate's next build would fail.`,
  );
}
const devDependencies = Object.fromEntries(
  Object.entries(packageJsonFile.devDependencies ?? {}).filter(
    ([name]) => !workspaceDevDependencies.includes(name),
  ),
);

const packageJson = {
  ...packageJsonFile,
  dependencies: { ...packageJsonFile.dependencies, ...vendoredDependencies },
  devDependencies,
  packageManager: `npm@${npmVersion.trim()}`,
};
delete packageJson.scripts.bundle;
delete packageJson.scripts.lint;

await writeFile(
  join(outDir, "package.json"),
  JSON.stringify(packageJson, null, 2),
);

// The source config is CLI-managed and says pnpm; only the staged copy is switched.
const slateConfigFile = join(outDir, ".catalyst/slate-config.toml");
const slateConfig = await readFile(slateConfigFile, "utf-8");
await writeFile(
  slateConfigFile,
  slateConfig
    .replace(/^install_command = .*$/m, 'install_command = "npm install"')
    .replace(/^build_command = .*$/m, 'build_command = "npm run build"'),
);

// npm 12 defaults `allow-remote` to `none`, which can refuse registry tarballs while
// resolving the lockfile.
const { stderr } = await execAsync(
  "npm install --package-lock-only --allow-remote=all",
  { cwd: outDir, env: npmEnv },
);
if (stderr) process.stderr.write(stderr);
