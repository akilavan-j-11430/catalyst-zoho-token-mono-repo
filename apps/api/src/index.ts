import "@/framework/catalyst-logger";
import { setLogTimeZone } from "@repo/node-utils/framework/logger";
import { app } from "@/app";
import { env } from "@/env";

setLogTimeZone(env.optional("TZ"));

const PORT = Number(
  process.env["X_ZOHO_CATALYST_LISTEN_PORT"] ?? process.env["PORT"] ?? 8000,
);

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
