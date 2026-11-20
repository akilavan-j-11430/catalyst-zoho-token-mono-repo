import type { Socket } from "net";
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const PORT = process.env["X_ZOHO_CATALYST_LISTEN_PORT"] || 3000;
const app = express();

const webProxy = createProxyMiddleware({
  target: "http://localhost:4000",
  changeOrigin: true,
  ws: true,
});

app.use(webProxy);

/** The keys the Catalyst SDK reads. `catalyst serve` sets them for this process from the
 *  project you are signed in to; an app turbo starts gets none, so they are printed to paste
 *  into its `.env`. URLs and a suffix - never a credential. */
const CATALYST_SDK_KEYS = [
  "X_ZOHO_CATALYST_IS_LOCAL",
  "X_ZOHO_CATALYST_ACCOUNTS_URL",
  "X_ZOHO_CATALYST_CONSOLE_URL",
  "CATALYST_PORTAL_DOMAIN",
  "X_ZOHO_STRATUS_RESOURCE_SUFFIX",
];

const server = app.listen(PORT, () => {
  console.log(`[proxy] http://localhost:${PORT}`);
  if (process.env["X_ZOHO_CATALYST_ACCOUNTS_URL"]) {
    const sdkKeys = CATALYST_SDK_KEYS.map((key) => `${key}=${process.env[key] ?? ""}`);
    console.log(["[proxy] Catalyst SDK keys for apps/web/.env:", ...sdkKeys].join("\n"));
  }
});

server.on("upgrade", (req, socket, head) => {
  webProxy.upgrade(req, socket as Socket, head);
});
