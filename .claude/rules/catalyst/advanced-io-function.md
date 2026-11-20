---
paths:
  - "apps/*/catalyst-config.json"
---

# Advanced I/O function

An Advanced I/O function is an Express app built as `node-api/express-app.md` describes,
with one difference: the deployed function never starts a server. It exports the app, and
Catalyst calls the app once per request. An Express app is itself a `(req, res)` handler,
so that works directly.

Creating the workspace, its bundle, `catalyst.json` and the `deploy` flag is covered in
the `add-aio-fn` skill. This file covers what differs from any other Express app.

## When to use one

Use it when an HTTP API should deploy and scale apart from the web app, and every request
finishes inside 30 seconds. Use an AppSail when the work runs longer, holds a connection
open, or must keep state in memory between requests (`node-api/code-placement.md`).

## Layout

The layout, middleware order, scopes, errors and responses are those of
`node-api/express-app.md`, and its paths follow `general/routing.md`. Two files differ:

```ts
// src/index.ts
import { app } from "@/app";

module.exports = app;
```

```ts
// src/dev-server.ts - local only, never bundled
import { app } from "@/app";

app.listen(8101);
```

- **The logger is configured in `index.ts`,** before the export:
  `Logger.configure({ output: CatalystLogOutput })` (`general/logging.md`).
- **No port lookup and no shutdown in `index.ts`.** Only the dev server listens.
- **Flush after each response.** A run has no `close` to flush before, and Catalyst may
  stop the instance once the response is sent, so `recordRequestTiming`'s `finish` listener
  calls `void CatalystLogOutput.flush()` after its own line. Whether lines are lost
  without it is unverified; check the first deploy's log for the timing line.
- **`catalyst-config.json`** comes from `catalyst functions:add --type aio`.
- **`express` is a runtime `dependency`.** The deployed function runs it, so the bundle
  must install it.

## The path the app sees

Locally, the proxy forwards `/<prefix>/...` to the dev server unchanged. When deployed,
Catalyst serves the function at `https://<project-domain>/server/<name>/`. Which part of
that URL reaches `req.url` has not been verified for an Express app. On the first deploy,
log `req.url` once from a known route. Then, if the two differ, add a `pathRewrite` to
the proxy route so that the local path matches what the deployed function receives. Do
not handle both shapes in the app's routes.

## Who can call it

- **Security Rules start at `optional`**, so the function URL is public. Each route guards
  itself: `initCatalystScopes([CatalystScope.User])` answers 401 to a caller without a
  valid token. Admin scope proves nothing about the caller.
- **When the web app calls it**, it does so from its server code through `HttpClient`, as
  for an AppSail - "When the web app calls it" in `.claude/skills/deployable-steps.md`.
- Never set a CORS header in the app. Catalyst injects one, and a second copy makes the
  browser reject both.

## Limits

- 30 seconds per request. After that the caller gets a 504.
- Request and response bodies of up to 250 MB.

## Local run

`"dev": "tsx watch --env-file-if-exists=.env src/dev-server.ts"`
on its own port, 8100 and up. The proxy routes the prefix to that port, so requests go
through the URL `pnpm dev` prints and carry the Catalyst headers.

## Tests

Drive the app from `src/app.ts` through Supertest, and fake our wrappers and
`zcAuth.init`, as `node-api/express-app.md` and `testing.md` describe.
