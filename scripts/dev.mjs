// Starts `catalyst serve`, asks the proxy behind it for the common env - the Catalyst SDK's
// keys, which the CLI set for it - then starts every dev task with it, so no app's .env has to
// carry them.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

// The path apps/proxy/src/index.ts serves the common env on, reached through catalyst
// serve's front port - the first free one from 3000 up.
const COMMON_ENV_PATH = "/__common/env";
const FIRST_FRONT_PORT = 3000;
const LAST_FRONT_PORT = 3100;
const WAIT_LIMIT_MS = 120_000;

let apps;

// Both are gitignored, so a fresh clone has neither, and catalyst serve cannot start without
// them.
for (const catalystFile of [".catalystrc", "catalyst.json"]) {
  if (!existsSync(catalystFile)) {
    console.error(
      `${catalystFile} is missing from the repo root - README "First run" says how to create it.`,
    );
    process.exit(1);
  }
}

/** The common env from one port, or undefined when nothing there is our proxy yet. The
 *  front port answers 502 until the proxy is up, and another app may hold a port in range. */
async function askProxy(port) {
  try {
    const response = await fetch(`http://localhost:${port}${COMMON_ENV_PATH}`, {
      signal: AbortSignal.timeout(500),
    });
    const commonEnv = response.ok ? await response.json() : undefined;
    return commonEnv?.X_ZOHO_CATALYST_IS_LOCAL === undefined ? undefined : commonEnv;
  } catch {
    return undefined;
  }
}

async function waitForProxy() {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (Date.now() < deadline) {
    for (let port = FIRST_FRONT_PORT; port <= LAST_FRONT_PORT; port++) {
      const commonEnv = await askProxy(port);
      if (commonEnv !== undefined) {
        return { port, commonEnv };
      }
    }
    await delay(1000);
  }
  throw new Error(
    `No proxy answered ${COMMON_ENV_PATH} on ports ${FIRST_FRONT_PORT}-${LAST_FRONT_PORT} ` +
      `within ${WAIT_LIMIT_MS / 1000} s.`,
  );
}

// stdin "ignore" is /dev/null. When stdin is not a terminal, catalyst serve waits for EOF
// before starting the AppSail, and an open pipe never sends one. Its output is dropped too:
// the ready line below is all a run needs, and `pnpm spawn:proxy` shows the rest.
const proxy = spawn("pnpm", ["run", "spawn:proxy"], { stdio: "ignore" });

proxy.once("exit", (exitCode) => {
  if (apps === undefined) {
    console.error(`[dev] Catalyst serve stopped before it was ready - run "pnpm spawn:proxy" to see why.`);
  }
  apps?.kill();
  process.exit(exitCode ?? 1);
});
// Ctrl-C reaches every process in the group itself; ignoring it here waits for them to stop.
process.on("SIGINT", () => {});
process.once("SIGTERM", () => {
  apps?.kill();
  proxy.kill();
});

try {
  const { port, commonEnv } = await waitForProxy();
  console.log(`[dev] Catalyst serve is ready - open http://localhost:${port}`);
  apps = spawn("turbo", ["run", "dev"], { stdio: "inherit", env: { ...process.env, ...commonEnv } });
  apps.once("exit", () => proxy.kill());
} catch (error) {
  console.error(`[dev] ${String(error)}`);
  proxy.kill();
}
