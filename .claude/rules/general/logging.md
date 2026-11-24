# Logging

Every server line goes through `Logger` (`@repo/logger/logger`). Every deployable that runs
Node - the Next.js server in `apps/web`, an AppSail, a Catalyst function - injects
`CatalystLogOutput` (`@repo/logger/catalyst-log-output`) into it at its entry point, so its
lines reach the log collector Catalyst hands the process, each with its level.

## Writing a line

```ts
const logger = Logger.for("billing");

logger.info("Invoice sent", { invoiceId }, status);
```

- **One `Logger.for("<source>")` per file, at module scope**, named for the part of the app
  that logs. Each call writes one block: the source, and inside an execution context its
  execution id and the line's order within it. Each value goes on its own line - an object as
  JSON, an Error with its stack.
- **Never `console` in server code.** An `HttpClient` takes its logger as an option -
  `logger: Logger.for("billing")` - and never writes to `console` itself (`outbound-http.md`).
- **Never log a credential.** No request header, no failed Catalyst init error, no body that
  carries a token - the `x-zc-*` headers and the SDK's init error both hold the caller's
  credential tokens.

## Injecting the Catalyst output

Each deployable configures the logger exactly once, before its first line:

```ts
Logger.configure({ timeZone: env.optional("TZ"), output: CatalystLogOutput });
```

| Deployable | Configured in | On shutdown |
|---|---|---|
| the Next.js server (`apps/web`) | `src/server-logging.ts`, imported by `src/execution-context.ts` and `src/instrumentation.ts` | `process.once("SIGTERM", () => void CatalystLogOutput.flush())` beside it - best effort, since Next runs its own shutdown |
| an AppSail | `src/index.ts`, before `listen` | on `SIGTERM` and `SIGINT`: close the server, `await CatalystLogOutput.flush()`, then exit |
| a Catalyst function | `src/index.ts`, before the export (`function-entry-point.md`) | before each run closes: `await CatalystLogOutput.flush()`, then `closeWithSuccess()` or `closeWithFailure()` - Catalyst may stop the process once the run closes. With no collector it returns at once. An Advanced I/O function has no close, so it flushes once each response finishes (`advanced-io-function.md`) |

- **Only an entry point configures.** `configure` throws once a line has been written, so a
  package, a route or a test never calls it. A package only calls `Logger.for`.
- **In Next.js, every bundle configures its own copy.** Next bundles server code apart, and
  each bundle gets its own copy of `@repo/logger` - checked on a production build, where
  `serverExternalPackages` does not merge them for a workspace package. Configuring once in
  `instrumentation.ts` would leave the pages' copies unconfigured. So every page, Server
  Action and route handler imports `execution-context.ts`, which imports `server-logging.ts`,
  and `instrumentation.ts` imports it too, for the copy its `onRequestError` writes with
  (`nextjs/errors.md`).
- **The app never reads the collector's variable.** `CatalystLogOutput` reads
  `X_ZOHO_SPARKLET_LOG_FD` itself. Where it is unset - locally, under `catalyst serve` or
  `pnpm dev` - each block goes to stdout instead, so nothing changes between local and
  deployed code.
- **Flush on shutdown.** The output writes through a non-blocking stream, so lines still
  queued when the process exits are lost unless the entry point awaits
  `CatalystLogOutput.flush()` first.
- **`TZ` is the app's own key** (`environment.md`), read through its `env` and passed in. The
  logger defaults to `Asia/Kolkata` when it is unset.
