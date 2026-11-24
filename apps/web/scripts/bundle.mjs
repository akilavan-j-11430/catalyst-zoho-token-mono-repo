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
  // A local `.env` must not ship: `next build` on Slate would inline its values. Deployed
  // values are set in the Slate Console.
  filter: (source) =>
    !skippedEntries.has(relative(root, source)) &&
    !relative(root, source).startsWith(".env") &&
    !source.endsWith(".tsbuildinfo"),
});

const packageJsonFile = JSON.parse(
  await readFile(join(root, "package.json"), "utf-8"),
);

/** A workspace package's folder under packages/ - `@repo/catalyst-node` -> `catalyst-node`. */
function folderOf(name) {
  return name.slice("@repo/".length);
}

// Every @repo package the app reaches, directly or through another @repo package -
// `@repo/catalyst-node` brings `@repo/async-context`, `@repo/case-conversion` and `@repo/types`.
const repoManifests = new Map();
const pendingNames = Object.keys(packageJsonFile.dependencies).filter((name) =>
  name.startsWith("@repo/"),
);
while (pendingNames.length > 0) {
  const name = pendingNames.pop();
  if (repoManifests.has(name)) {
    continue;
  }
  const manifest = JSON.parse(
    await readFile(join(packagesDir, folderOf(name), "package.json"), "utf-8"),
  );
  repoManifests.set(name, manifest);
  pendingNames.push(
    ...Object.keys(manifest.dependencies ?? {}).filter((dependency) =>
      dependency.startsWith("@repo/"),
    ),
  );
}

// A vendored package's own third-party dependencies - `pino`, the `@zcatalyst/*` SDKs - are
// installed at the staged app's root, where Node finds them walking up from vendor/. Two
// packages asking for different versions of one dependency would install only one, so stop.
const liftedDependencies = { ...packageJsonFile.dependencies };
for (const [name, manifest] of repoManifests) {
  for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
    if (dependency.startsWith("@repo/")) {
      continue;
    }
    const wanted = liftedDependencies[dependency];
    if (wanted !== undefined && wanted !== version) {
      throw new Error(
        `${name} needs ${dependency}@${version}, but the app installs ${wanted}. Align them before bundling.`,
      );
    }
    liftedDependencies[dependency] = version;
  }
}

// Slate uploads only this directory, so a workspace package is copied in from its built
// output and installed as a `file:` dependency of the app itself - every @repo package the
// app reaches, so one vendored package finds another at the app's root.
async function vendorPackage(name, manifest) {
  const sourceDir = join(packagesDir, folderOf(name));
  const targetDir = join(outDir, "vendor", folderOf(name));
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
  return [name, `file:./vendor/${folderOf(name)}`];
}

const vendoredDependencies = Object.fromEntries(
  await Promise.all(
    [...repoManifests].map(([name, manifest]) => vendorPackage(name, manifest)),
  ),
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
  dependencies: { ...liftedDependencies, ...vendoredDependencies },
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
