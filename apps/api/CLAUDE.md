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
|-- errors/http-error.ts  typed failures that map to HTTP statuses
|-- utils/api.ts          response builders
`-- framework/catalyst-logger.ts   console -> Catalyst log pipe, imported for side effect
```

`catalyst-logger` is imported first in `index.ts` purely for its side effect: it
replaces the `console` methods so logs are framed for Catalyst's collector. It exports
nothing you should call.

## Middleware order

From `src/index.ts`, and the order is load-bearing:

1. `express.json()`
2. `/api` -> `initExecutionContext`, then `recordRequestTiming`
3. `/api/v1` -> `apiRouter` (`src/routes/api-router.ts`), which holds every route
4. `/` -> JSON 404 catch-all
5. `errorHandler` (terminal)

`index.ts` mounts one router, and `api-router.ts` composes the rest, so a new route
cannot land below the catch-all and quietly 404. Add it there, not here.

Every path segment is a constant in `ApiPath` (`@repo/routing/api-path`), shared with
`apps/web`; a full path is `join(...)` of them (`@repo/routing/path`). `api-router.ts`
mounts each router under its own segment - `apiRouter.use(ApiPath.ZohoToken,
zohoTokenRouter)` - and the router names only what follows it, `ApiPath.Callback`. So a
router-level `use`, like the `validateUserAuthentication` on `zohoTokenRouter`, covers
that router's routes and nothing else.

## Execution context

`initExecutionContext` (`src/middleware.ts`) calls `zcAuth.init(req, { scope })` from
`@zcatalyst/auth` once per `CatalystScope` and runs the rest of the chain inside
`runWithContext`. Catalyst reads the project details and the caller's credentials off the
request headers, so the apps are per-request and nothing needs configuring in the
environment.

Three things about that call are easy to get wrong:

- **It is async.** The node facade loads its implementation through a dynamic import, so
  `init` returns a promise. Unawaited, that promise is truthy, reaches the SDK intact and
  only fails later as `app.credential.getToken is not a function`.
- **User and Admin are different apps.** A user-scope app acts as the signed-in caller, so
  `getCurrentUser()` identifies them and App User table permissions apply. An admin-scope
  app acts as the application. The wrapper picks which one it reads with
  `manager.catalyst.getApp(scope)`.
- **A failed scope does not fail the request.** A request with neither a user token nor a
  cookie cannot build the User app (`missing user credentials`). That scope is left unset
  and logged, and `getApp(CatalystScope.User)` throws `CatalystError` (`SCOPE_UNAVAILABLE`)
  only if something asks for it. `validateUserAuthentication` turns that into a 401.

This is why requests must arrive through `catalyst serve` - only the CLI injects those
headers. Bypass it and every scope's `zcAuth.init` fails with `app/invalid_project_details`
(logged by `initExecutionContext`), so the first Catalyst call throws `SCOPE_UNAVAILABLE`,
which `errorHandler` renders as a generic 500. If every `/api` route is 500ing in dev, that is
the cause, not your handler.

Handlers must **not** initialize Catalyst themselves, and must not reach for the app at
all. Import a resource handle and pick the scope with `runIn` - it reads that scope's app
off the context for you:

```ts
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { todoTable } from "@repo/node-utils/services/catalyst/resources";

const todo = await todoTable.runIn(CatalystScope.User).getRow(rowId);
```

Handles are declared once in `packages/node-utils/src/services/catalyst/resources.ts`,
never in a route. `Zcql` is the exception: a query belongs to no single table, so it is
static - `Zcql.runIn(CatalystScope.User).executeQuery("SELECT ...")`.

If a handle cannot do what the route needs, **add the method to the wrapper** rather than
reaching for the SDK here. A single-use method is still the right shape.

The wrappers throw `CatalystError` (`@repo/node-utils/errors/catalyst-error`), which carries
an `ErrorCode`; catch it at the route only to map onto an `HttpError`, otherwise let it
reach `errorHandler` as a 500. `.claude/rules/catalyst-sdk.md` is the full rule.

`currentContext()` throws outside a request. Carry anything else request-scoped via
`manager.setExtras(key, value)` / `manager.getExtras<T>(key)`.

## Adding a route

`src/routes/ping.ts` is the reference:

```ts
import { Router } from "express";
import { ApiPath } from "@repo/routing/api-path";
import { toRecordResponse } from "@/utils/api";

export const pingRouter: Router = Router();

pingRouter.get(ApiPath.Ping, (_req, res) => {
  res.json(toRecordResponse({ message: "pong" }));
});
```

Add any new segment to `ApiPath` first, never as a string literal. Then add one line to
`src/routes/api-router.ts` - `apiRouter.use(ApiPath.Auth, authRouter)` for a router with a
prefix; `ping` is a single route, so it mounts bare and names `ApiPath.Ping` itself. The `: Router`
annotation is not optional: the declaration emit cannot infer the type across the package
boundary without it.

## Errors and responses

Throw `HttpError` (`src/errors/http-error.ts`) rather than setting a status by hand -
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

Through `HttpClient` from `@repo/node-utils/http/http-client` - never `fetch` or another
client directly. One instance per service at module scope; the full rule, the body and
response shapes and the transport seam are in `.claude/rules/outbound-http.md`.

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
