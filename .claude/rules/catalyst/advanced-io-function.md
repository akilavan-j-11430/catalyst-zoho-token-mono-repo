# Advanced I/O function

An Advanced I/O function is an Express app built like `apps/api`, with one difference:
the deployed function never starts a server. It exports the app, and Catalyst calls the
app once per request. An Express app is itself a `(req, res)` handler, so that works
directly.

Creating the workspace, its bundle, `catalyst.json` and the `deploy` flag is covered in
the `add-aio-fn` skill. This file covers what goes inside.

## When to use one

Use it when an HTTP API should deploy and scale separately from `api`, and every request
finishes inside 30 seconds. Use a router in `apps/api` when the route belongs with the
rest of the API. Use an AppSail when the work runs longer, holds a connection open, or
must keep state in memory between requests.

## Layout

```
apps/<name>/
  src/app.ts            the Express app - middleware order as in apps/api's app.ts
  src/index.ts          `module.exports = app` - the bundle entry, never listens
  src/dev-server.ts     `app.listen(port)` - local only, never bundled
  src/routes/           routers, as in apps/api
  src/env.ts            this app's own keys
  catalyst-config.json  from `catalyst functions:add --type aio`
```

```ts
// src/index.ts
import { app } from "@/app";

module.exports = app;
```

```ts
// src/dev-server.ts - local only
import { app } from "@/app";

app.listen(8101);
```

`app.ts` builds the app without a listener, as `apps/api/src/app.ts` does. That is what lets
the deployed entry, the dev server and the Supertest integration tests share one app.

## Inside the app

Everything `apps/api/CLAUDE.md` says about routes holds here. Only the import path
changes, because the shared plumbing comes from `@repo/http-server` (`.claude/skills/deployable-steps.md`):
- `initExecutionContext`, then the routers, then a JSON 404, then `errorHandler`, in that
  order.
- A route that calls Catalyst mounts `initCatalystScopes([...])`, which calls
  `zcAuth.init(req, { scope })` on the request Catalyst hands the function.
- Failures are thrown as `HttpError`, responses are built with the response builders, and
  logging goes through `logger`.
- Data goes through repositories and handles. The app never constructs an SDK client.

These parts differ from `apps/api`:
- **No `catalyst-logger.ts`.** It writes to AppSail's log descriptor, which a function
  does not have.
- **No port lookup in `index.ts`.** Only the dev server listens.
- **Paths live in `packages/routing/src/<name>-path.ts`**, named after the app, and start
  with the app's own prefix.
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
  itself, as in `api`: `initCatalystScopes([CatalystScope.User])` answers 401 to a caller
  without a valid token. Admin scope proves nothing about the caller.
- **When the browser calls it**, it is a separate origin, like a second AppSail:
  - `NEXT_PUBLIC_<NAME>_URL`, as in `environment.md`
  - a client pair in `apps/web/src/services/api/client.ts`
  - the Slate domain in Authorized Domains

  Never set a CORS header in the app. Catalyst injects one, and a second copy makes the
  browser reject both.

## Limits

- 30 seconds per request. After that the caller gets a 504.
- Request and response bodies of up to 250 MB.

## Local run

`"dev": "tsx watch --env-file-if-exists=../../.env --env-file-if-exists=.env src/dev-server.ts"`
on its own port, 8100 and up. The proxy routes the prefix to that port, so requests go
through the URL `pnpm dev` prints and carry the Catalyst headers, as they do for `api`.

## Tests

Follow `apps/api`: drive the app from `src/app.ts` through Supertest, and fake our
wrappers and `zcAuth.init`, as `testing.md` describes.
