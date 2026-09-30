# apps/api

Express 5 API on the modular `@zcatalyst/*` SDKs. Deployed as the Catalyst AppSail
named `api`, reached only through `apps/proxy` at `/api`.

Port: `X_ZOHO_CATALYST_LISTEN_PORT`, else `PORT`, else **8000**.

## Layout

```
src/
|-- index.ts              app setup, middleware order, route mounting
|-- env.ts                every environment variable this app reads
|-- middleware.ts         execution context, request timing, terminal error handler
|-- routes/ping.ts        reference route - copy this shape
|-- routes/auth.ts        POST /auth/register - registers a Catalyst app user
|-- errors/http_error.ts  typed failures that map to HTTP statuses
|-- utils/api.ts          response builders
`-- framework/catalyst_logger.ts   console -> Catalyst log pipe, imported for side effect
```

`catalyst_logger` is imported first in `index.ts` purely for its side effect: it
replaces the `console` methods so logs are framed for Catalyst's collector. It exports
nothing you should call.

## Middleware order

From `src/index.ts`, and the order is load-bearing:

1. `express.json()`
2. `/api` -> `initExecutionContext`, then `recordRequestTiming`
3. `/api` -> routers (`pingRouter`, ...)
4. `/` -> JSON 404 catch-all
5. `errorHandler` (terminal)

New routers mount at step 3. Below the catch-all they are unreachable - every request
404s instead.

## Execution context

`initExecutionContext` (`src/middleware.ts`) awaits `zcAuth.init(req)` from
`@zcatalyst/auth` and runs the rest of the chain inside `runWithContext`. Catalyst reads the
project details and the caller's credentials off the request headers, so the app is
per-request and nothing needs configuring in the environment.

Two things about that call are easy to get wrong:

- **It is async.** The node facade loads its implementation through a dynamic import, so
  `init` returns a promise. Unawaited, that promise is truthy, reaches the SDK intact and
  only fails later as `app.credential.getToken is not a function`.
- **No scope is passed, and that is deliberate.** The app follows whatever the caller
  presents, so a handler acts as the signed-in user and `getCurrentUser()` identifies them.
  Pass `{ scope: "admin" }` and it acts as the application instead: `getCurrentUser()` can no
  longer say who is calling, and App User table permissions stop applying to anything this
  API does.

  The price is that a request carrying neither a user token nor a cookie is rejected here
  with `missing user credentials`, before any route runs. `POST /api/auth/register` is
  therefore reachable only by someone already signed in - it registers a second user, not the
  first. A route that needs to serve anonymous callers cannot sit behind this middleware.

This is why requests must arrive through `catalyst serve` - only the CLI injects those
headers. Bypass it and `zcAuth.init` throws `app/invalid_project_details`, which
`errorHandler` renders as a generic 500. If every `/api` route is 500ing in dev, that is
the cause, not your handler.

Handlers must **not** initialize Catalyst themselves, and must not reach for the app at
all. Import a resource handle - it reads the app off the context for you:

```ts
import { todoTable } from "@repo/node-utils/services/catalyst/resources";

const todo = await todoTable.getRow(rowId);
```

Handles are declared once in `packages/node-utils/src/services/catalyst/resources.ts`,
never in a route. `Zcql` is the exception: a query belongs to no single table, so it is
static - `Zcql.executeQuery("SELECT ...")`.

If a handle cannot do what the route needs, **add the method to the wrapper** rather than
reaching for the SDK here. A single-use method is still the right shape.

The wrappers throw `CatalystError` (`@repo/node-utils/errors/catalyst_error`), which carries
an `ErrorCode`; catch it at the route only to map onto an `HttpError`, otherwise let it
reach `errorHandler` as a 500. `.claude/rules/catalyst_sdk.md` is the full rule.

`currentContext()` throws outside a request. Carry anything else request-scoped via
`manager.setExtras(key, value)` / `manager.getExtras<T>(key)`.

## Adding a route

`src/routes/ping.ts` is the reference:

```ts
import { Router } from "express";
import { toRecordResponse } from "@/utils/api";

export const pingRouter: Router = Router();

pingRouter.get("/ping", (_req, res) => {
  res.json(toRecordResponse({ message: "pong" }));
});
```

Mount it in `src/index.ts` with `app.use("/api", pingRouter)`, above the catch-all.

## Errors and responses

Throw `HttpError` (`src/errors/http_error.ts`) rather than setting a status by hand -
`BadRequest` 400, `Unauthorized` 401, `NotFound` 404, `Conflict` 409. `errorHandler`
maps those; anything else is logged and becomes a 500 with a generic message, so do not
expect a raw thrown error to surface its message to the client.

Every response goes through `src/utils/api.ts`:

- `toRecordResponse(data)` - single record
- `toPagedResponse(data, page, perPage, count, nextPageToken?)` - computes `totalPages`
  and `hasMore`
- `toErrorResponse(message)` - error shape

The shapes live in `@repo/types/api` so the web app imports the same ones.

## Calling an external API

Through `HttpClient` from `@repo/node-utils/http/http_client` - never `fetch` or another
client directly. One instance per service at module scope; the full rule, the body and
response shapes and the transport seam are in `.claude/rules/outbound_http.md`.

The body decides its own encoding - an object becomes JSON, a string is text, `FormData`
is multipart. A third argument refines that but may not contradict it. A call resolves to
the whole response - read the body as `json()`, `text()` or `raw()`.

```ts
const { body } = await billing.post("/invoices", dto);
const invoice = toInvoice(await body.json());
```

Both a non-2xx and an unreachable host reject with `HttpRequestError`, which carries
`status`, `headers` and `body` flat and synchronous for logging. Unhandled, it falls
through to `errorHandler` as a 500 - the right default for an upstream failure. Catch it
only to map a specific upstream status:

```ts
catch (error) {
  if (error instanceof HttpRequestError && error.status === 404) {
    throw HttpError.NotFound(`No invoice ${id}.`);
  }
  throw error;
}
```

## Logging

Use `logger` from `@repo/node-utils/framework/logger`, not `console`. It stamps the
execution ID and a per-request order number from the async context.

## Build

- `pnpm build` - `tsc --build && tsc-alias` into `dist/` (resolves the `@/*` alias).
- `pnpm bundle` - `scripts/bundle.mjs` esbuilds `src/index.ts` into `appsails/api/`.

The bundle script reads `package.json`, strips every `@repo/*` dependency from the
emitted manifest, and marks the rest external. Shared-package code is therefore
**inlined by esbuild at bundle time**, not resolved at runtime - so a shared package
that reaches for something outside the bundle (a file on disk, a native module) works
under `tsx watch` and breaks in AppSail.
