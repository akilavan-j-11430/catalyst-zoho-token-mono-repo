import "server-only";
import { CatalystLogOutput } from "@repo/logger/catalyst-log-output";
import { Logger } from "@repo/logger/logger";
import { env } from "@/env";

// Configures the logger for this part of the server. Next splits server code into separate
// bundles, each with its own copy of @repo/logger, so configuring it in one place leaves the
// others unconfigured. execution-context.ts imports this, and every page, Server Action and
// route handler imports that; instrumentation.ts imports it for its own copy. Each copy is
// then configured once, before it writes a line.
Logger.configure({
  timeZone: env.optional("TZ"),
  output: CatalystLogOutput,
});

// Next runs its own graceful shutdown on SIGTERM; this writes the log lines still queued for
// Catalyst's collector alongside it. Best effort - the queue is small, so it finishes first.
process.once("SIGTERM", () => void CatalystLogOutput.flush());
