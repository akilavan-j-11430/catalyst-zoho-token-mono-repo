# Routes, services and repositories

Server code that answers a call is split three ways - route, service, repository - the
controller-service-repository layering most backends use. Each layer has one job, and a
layer is skipped when it would only pass a call through.

| Layer | Does | Never |
|---|---|---|
| **Route** - `apps/api/src/routes/` | Turns HTTP into one call and back: validate the input's shape, call one operation, build the response, choose the status | holds a business rule, or calls a table, `Zcql` or the SDK |
| **Service** - `src/services/<domain>-service.ts` | One business operation - admit a patient, approve an invoice: the rule, and the coordination across repositories and handles | knows `req`, `res`, a status code or the response envelope |
| **Repository / wrapper** - `node-utils` | Data access only - ZCQL, column names, SDK calls (`vendor-boundaries.md`) | decides anything about the business |

## The route

A route reads as five lines: validate, call, respond.

```ts
meRouter.get(ApiPath.Me, initCatalystScopes([CatalystScope.User]), async (_req, res) => {
  res.json(toRecordResponse(await UserManagement.currentUser()));
});
```

- **Validation is the route's job**, and only of shape - a required field, an email, a
  number in range. The route declares a zod schema and calls `RequestInput.parse`
  (`@repo/http-server/request-input`), never a hand-written check per field - see
  "Validating input" in `apps/api/CLAUDE.md`.
- A rule about the business - "a discharged patient cannot be admitted again" - is not
  validation. It belongs to the service, which throws, and the route lets it reach
  `errorHandler`.
- `HttpError` and the response builders stay in the route. A service throws its own or the
  wrapper's error, and the route maps it only when a specific status is wanted.

## The service

Add one when the work is more than a single data call:

- it holds a business rule;
- it coordinates two or more repositories or handles;
- or a second caller needs the same operation - a job function, a Signal handler, another
  route. Logic written in a route is reachable only over HTTP.

Until then a route calls the repository or wrapper directly, as `/me` calls
`UserManagement.currentUser()`. A service that only forwards one call is the empty layer
the root instructions rule out - the same rule as "a file earns its existence from a second
caller".

A service is a class with static members (`code-design.md`), takes and returns domain
types from `@repo/types`, and names the business operation, not the storage:
`AdmissionService.admit(patientId)`, not `PatientService.updateRow(...)`.

It lives in `apps/api/src/services/` while only `apps/api` calls it. When a function or a
second AppSail needs it, it moves to a shared server package, since nothing can import from
an app.

## The repository

Unchanged from `vendor-boundaries.md`: one class per aggregate in
`packages/node-utils/src/repositories/`, the only code naming a table's columns. A service
calls it; a route calls it directly only while there is no service in between.
