---
paths:
  - "apps/*/src/app.ts"
  - "apps/*/src/routes/**"
---

# Where code goes in a Node API

A Node API is an Express app - an AppSail, or an Advanced I/O function, which is built the
same way. This rule says when to create one, what a route does, where the work behind it goes,
and when that work moves. Code starts as small as it can and moves
only when a real caller asks for it - "a file earns its existence from a second caller" in the
root `CLAUDE.md`. `apps/web` makes the same moves (`nextjs/code-placement.md`), so an area has
one name wherever it lives.

How the app is wired - middleware order, the execution context, errors and responses - is
`express-app.md`; its paths are `general/routing.md`.

## No API app until one is needed

None ships. The web app's pages read and its Server Actions write on its own server, and
its `route.ts` files serve only its own browser (`nextjs/code-placement.md`).

A caller outside the web app - a mobile app, a webhook, another service - is served by an
API app. Its Express middleware answers a caller with no signed-in user with a 401, where the
web app's `withCatalystFn` would throw. Create the first one when the first such caller
arrives, and agree it with the user first, since it is a new deployable:

| The API must | Create | Skill |
|---|---|---|
| deploy and scale apart from the web app, each request under 30 s | an Advanced I/O function | `add-aio-fn` |
| run past 30 s, hold WebSockets, or keep state between requests | an AppSail | `add-appsail` |

Either way it is built as `express-app.md` describes, named for what it serves - `billing`,
not `api` - with its paths in `src/<name>-path.ts`.

## The layers

| Layer | Does | Never |
|---|---|---|
| **Route** - `src/routes/<segment>.ts` | Turns HTTP into one call and back: checks the input's shape, calls one operation, builds the response, chooses the status | holds a business rule, or calls a table handle, `Zcql` or the SDK |
| **Area** - `src/<area>/<areas>.ts` | One business operation - admit a patient, approve an invoice: the rule, and the coordination across repositories and handles | knows `req`, `res`, a status code, `HttpError` or the response envelope |
| **Repository** - `@repo/repositories` | Loads and saves this app's records | decides anything about the business - `general/repositories.md` |

## The route

A route reads as: check, call, respond.

```ts
invoiceRouter.get(BillingPath.InvoiceId, initCatalystScopes([CatalystScope.User]), async (req, res) => {
  const { invoiceId } = InputValidation.parse(invoiceParams, req.params);
  const invoice = await InvoiceRepository.find(invoiceId);
  if (!invoice) {
    throw HttpError.NotFound(`No invoice ${invoiceId}.`);
  }
  res.json(toRecordResponse(invoice));
});
```

- **It checks shape only** - a required field, an email, a number in range - with a zod
  schema through `InputValidation.parse`, never a check per field (`express-app.md`). The schema lives in the route file until a second route needs it.
- **A business rule is not validation.** "A discharged patient cannot be admitted again"
  belongs to the area, which throws, and the route lets the error reach `errorHandler`.
- **A missing record is a 404 the route throws,** since a repository answers `undefined`
  rather than deciding the status.
- **`HttpError` and the response builders stay in the route.** An area throws its own error
  or the wrapper's, and the route maps it to an `HttpError` only when a specific status is
  wanted.
- **It names every scope it reads** in `initCatalystScopes([...])`. A forgotten scope means no
  data access (`SCOPE_UNAVAILABLE`), never open access. Admin proves nothing about the caller.

## When it moves

Each move is made when its trigger happens, never in advance:

| When | Move it to |
|---|---|
| the work is more than one call - a business rule, or two repositories or handles to coordinate | `src/<area>/<areas>.ts` - `src/admission/admissions.ts`, class `Admissions` - and the route calls it |
| a second route needs the same operation | that area |
| a second route needs the same input rules | `src/<area>/<area>-validation.ts` |
| another deployable needs the operation - the web app, a job, a Signal function | a package, `packages/<area>` (`@repo/admissions`), that both import. Nothing imports from an app |
| an area file passes ~300 lines, or holds groups that have nothing to do with each other | one file per group - `admission-transfers.ts` - and a subfolder per group once a group itself grows |

Until the first trigger, the route calls the repository or wrapper directly, as the invoice
route above calls `InvoiceRepository.find`. An area method that only forwards one call is an empty layer.

## An area

```
src/
  routes/admission.ts                 the admission endpoints - check, call, respond
  admission/admissions.ts             Admissions - the rules and the calls behind them
  admission/admission-validation.ts   once a second route checks the same input
```

- **Named after the business.** `admission/`, `invoice/` - straight under `src/`, with no
  `services/`, `features/` or `domains/` folder around them.
- **No pattern or framework words in a name.** `Admissions`, not `AdmissionService`; no
  `-service`, `-controller` or `-handler`.
- **A class with static members** (`code-design.md`) that takes and returns domain types from
  `@repo/types` and is named for the operation, not the storage: `Admissions.admit(patientId)`,
  not `Patients.updateRow(...)`.
- **An area uses another only through its `<areas>.ts`.** An operation that belongs to two
  lives in the one that owns the data it changes.

## Boundaries that hold from the first file

These do not wait for a second caller, because breaking one is a security problem, not a
tidiness one:

- **One execution context per request.** `initExecutionContext` starts it, and nothing below
  it calls `runWithContext`, or its lines lose the request's id.
- **No credential leaves the server.** Never log or return a request header or a failed
  Catalyst init error - both carry the `x-zc-*` credential tokens.
- **Catalyst only through `@repo/repositories` and `@repo/catalyst-node`.** Never ZCQL or an
  SDK call in the app.
