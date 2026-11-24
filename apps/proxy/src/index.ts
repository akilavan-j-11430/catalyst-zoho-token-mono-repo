import type { Socket } from "net";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const PORT = process.env["X_ZOHO_CATALYST_LISTEN_PORT"] || 3000;
const app = express();

/** The common env: the keys the Catalyst SDK reads, which every app needs. `catalyst serve`
 *  sets them for this process from the project you are signed in to; an app turbo starts gets
 *  none, so the root `scripts/dev.mjs` asks for them here and hands them to every dev task.
 *  URLs and a suffix - never a credential. */
const COMMON_ENV_KEYS = [
  "X_ZOHO_CATALYST_IS_LOCAL",
  "X_ZOHO_CATALYST_ACCOUNTS_URL",
  "X_ZOHO_CATALYST_CONSOLE_URL",
  "CATALYST_PORTAL_DOMAIN",
  "X_ZOHO_STRATUS_RESOURCE_SUFFIX",
];

// The root `scripts/dev.mjs` reads the common env here - keep its copy of the path in step.
app.get("/__common/env", (_req, res) => {
  const commonEnv = Object.fromEntries(
    COMMON_ENV_KEYS.filter((key) => process.env[key] !== undefined).map((key) => [
      key,
      process.env[key],
    ]),
  );
  res.json(commonEnv);
});

const webProxy = createProxyMiddleware({
  target: "http://localhost:4000",
  changeOrigin: true,
  ws: true,
});

app.use(webProxy);

const server = app.listen(PORT, () => {
  console.log(`[proxy] http://localhost:${PORT}`);
});

server.on("upgrade", (req, socket, head) => {
  webProxy.upgrade(req, socket as Socket, head);
});
