---
paths:
  - "apps/*/catalyst-config.json"
  - "apps/*/src/handler.ts"
  - "apps/*/src/job-dispatcher.ts"
  - "apps/*/src/signal-dispatcher.ts"
---

# Function entry point

`src/index.ts` is the entry point of every Catalyst function in this repo, whatever its
kind. The rule for each kind shows a full entry point. This file explains four things
they all must get right.

- **The export is `module.exports = handler` (or `= app`), exactly.** Catalyst calls the
  module itself, so the export has to be the function. `export default` bundles to
  `{ default: handler }`, which Catalyst cannot call. `export =` fails to typecheck under
  `base.json`'s `module: "ESNext"` (TS1203).
- **The entry point starts one execution context per run and sets the apps it needs.** An
  Advanced I/O function does both through `initExecutionContext` and `initCatalystScopes`,
  as every Express app does (`node-api/express-app.md`). Every other kind does it in
  `index.ts`: inside `runWithContext`, it first awaits
  `CatalystSession.setApp(context.catalystHeaders, CatalystScope.Admin)` for each scope its
  code uses, then runs the work. Apps are not built on first use, so a wrapper asking for a
  scope the entry point did not set throws `SCOPE_UNAVAILABLE`. No function calls
  `zcAuth.init` itself - `setApp` does.
  Not yet run on a deployed function: the SDK recognises a function's context by its
  `catalystHeaders` key, and `setApp` hands it `{ headers }`. If the first function's
  init rejects, give `CatalystSession` a way to pass the context through as-is.
- **Admin is the only scope wherever no signed-in user made the call.** That is always
  the case for a job or an event. A repository method that reads with User throws
  `SCOPE_UNAVAILABLE` there. The fix is a method for the function's own business case that
  reads with Admin (`general/repositories.md`, "Which scope a method reads with"), not a
  User app.
- **Logging goes through `Logger.for("<source>")`** (`@repo/logger/logger`,
  `general/logging.md`). The entry point configures it once with `output: CatalystLogOutput`, as every app does: it
  writes to the log collector when Catalyst hands the function one, and to stdout when it does
  not. Which a deployed function gets, and whether Catalyst collects its stdout, has not been
  checked yet.

`src/index.ts` is the bundle's only entry. A `src/dev-server.ts` is never imported from it,
so the dev server never ships.
