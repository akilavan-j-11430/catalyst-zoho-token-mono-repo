# Vendor boundaries

Write every piece of code so that moving off a vendor is a small, local change. Swapping
the Data Store for Postgres, Stratus for S3, AppSail for another Node host or `fetch` for
axios should mean rewriting the files at that vendor's boundary - never the routes,
services and components that sit on top of it.

## One seam per vendor

Each vendor is reached through exactly one place, and that place is the whole list of what
a migration has to rewrite:

| Vendor | Seam | Holds |
|---|---|---|
| Catalyst SDKs (server) | `packages/node-utils/src/catalyst/` | every `@zcatalyst/*` call - see `catalyst-sdk.md` |
| Catalyst Data Store tables | `packages/node-utils/src/repositories/` | ZCQL, column names, `ROWID`, Catalyst's data quirks |
| External HTTP services | `HttpClient` and its `HttpTransport` | transport, headers, encoding - see `outbound-http.md` |
| Zoho accounts server | `packages/node-utils/src/services/zoho/accounts.ts` | consent url, code exchange, refresh, revoke - see `zoho-token.md` |
| Catalyst web SDK | `apps/web/src/catalyst/` | sign-in, session, the signed-in user |
| AppSail runtime | `apps/api/src/index.ts`, `apps/api/scripts/bundle.mjs`, `app-config.json` | listen port, deployed bundle |
| Slate | `apps/web/scripts/bundle.mjs` | the staged deploy |

Code outside a seam names no vendor: no `@zcatalyst/*` import, no ZCQL, no Catalyst column
name, no vendor error class, no vendor casing.

## A seam speaks our language

- **It takes and returns our domain types** - camelCase, from `@repo/types` or declared
  beside the seam - never a vendor object, a vendor type or a vendor error. Map at the edge,
  as `toRegisteredUser` in `user-management.ts` does.
- **Its method names describe the business operation**, not the vendor call:
  `TodoRepository.listOpen()`, not `executeZcql(...)`.
- **A vendor quirk is handled inside the seam, with a comment**, so it leaves with the
  vendor: Catalyst's string booleans, its 1-based `LIMIT`, the `COUNT` key that differs by
  path.
- **A vendor failure becomes our error** (`CatalystError`, `HttpRequestError`) inside the
  seam. Above it, code catches only our errors.

## Tables go through a repository

A Data Store table is the deepest lock-in here - ZCQL, column names and `ROWID` are all
Catalyst's - so a route never touches a table handle or `Zcql`. It calls a repository
(Repository pattern) in `packages/node-utils/src/repositories/`, one class per aggregate,
which is the only code that imports that table's handle and names its columns:

```ts
// packages/node-utils/src/repositories/todo-repository.ts
/** Repository: every Data Store read and write of todos, and the only code naming their columns. */
export class TodoRepository {
  static async find(todoId: string): Promise<Todo | undefined> {
    const storedTodo = await todoTable.runIn(CatalystScope.User).getRow(todoId);
    return storedTodo && TodoRepository.toTodo(storedTodo);
  }

  private static toTodo(storedTodo: StoredRow<TodoRow>): Todo {
    return { todoId: storedTodo.ROWID, title: storedTodo.TITLE, notes: storedTodo.NOTES ?? undefined };
  }
}

// apps/api/src/routes/todo.ts
const todo = await TodoRepository.find(req.params.todoId);
```

Moving to Postgres then rewrites `todo-repository.ts` against the same methods and leaves
every route alone. It lives in `node-utils`, beside the handles, so a second AppSail or a
function reuses it rather than writing its own queries.

Bucket, cache and job handles need no extra layer: their wrapper methods - `getObject(key)`,
`submitJob({ params })` - already speak our vocabulary, so the wrapper is the seam and a
route may call it.

## Portability is not a reason to add layers

The seam's public methods are the contract. Do not add an interface, adapter or factory for
a second vendor that does not exist yet - that is the hypothetical-future abstraction
`code-design.md` rules out. When a migration is real, it rewrites the inside of the seam;
when two vendors must run side by side, that second case is what earns the interface.

When two options cost the same, take the portable one: plain Express over a Catalyst-only
hook, a standard Next.js feature over a Slate-only one, our own id names (`todoId`) over the
vendor's (`ROWID`).

## Where the coupling still is

Known, accepted, and the first things a migration touches:

- Routes that call Catalyst mount `initCatalystScopes([CatalystScope.X])`
  (`apps/api/src/middleware.ts`), and repositories and wrappers pick a `CatalystScope` in
  `runIn`. Removing Catalyst deletes those lines.
- `apps/api/src/middleware.ts` calls `zcAuth.init` to build the per-request app.
- `apps/api/src/framework/catalyst-logger.ts` writes to the AppSail log descriptor.
