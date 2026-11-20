# Catalyst SDK access

Every Catalyst SDK call goes through `packages/catalyst-node/src/`. No
`@zcatalyst/*` package may be imported anywhere else, and ESLint enforces it.

One file per component - `bucket.ts`, `table.ts`, `zcql.ts`, `cache.ts`, `job.ts` - plus
`catalyst-session.ts`, which sets the apps. The resources this app uses are named in
`@repo/repositories`'s `resources.ts`, below, since they belong to the solution, not the SDK.
Each component builds the SDK client it needs itself, in a module-private accessor at the
top of the file, from the app the entry point set for the request in flight, and reaches
for an app nowhere else:

```ts
// packages/catalyst-node/src/bucket.ts
import { Stratus } from "@zcatalyst/stratus";
import type { CatalystScope } from "@/catalyst-scope";
import { CatalystSession } from "@/catalyst-session";

function stratus(scope: CatalystScope): Stratus {
  return new Stratus(CatalystSession.app(scope));
}
```

That is what the directory buys: one place to read to know everything this repo asks of
Catalyst, and a boundary ESLint can name.

## Reaching a resource

A wrapper instance is a **handle**: it holds a name and nothing else. Build it once, at
module scope, in `resources.ts` in `@repo/repositories` - one `export const` per Catalyst
resource this repo uses, and the only place a wrapper is ever constructed:

```ts
// packages/repositories/src/resources.ts
import { Bucket } from "@repo/catalyst-node/bucket";
import { Cache } from "@repo/catalyst-node/cache";
import { Job } from "@repo/catalyst-node/job";
import { Table } from "@repo/catalyst-node/table";

/** A row of the Todo table, keyed by its Catalyst column names. */
export interface TodoRow {
  TITLE: string;
  NOTES?: string;
}

export const todoTable = Table.create<TodoRow>("Todo");
export const invoiceBucket = Bucket.create("invoices");
export const sessionCache = Cache.create();
export const reminderJob = Job.create<{ todoId: string }>({
  jobName: "reminder",
  aliasName: "reminder",
  jobPoolName: "default",
  jobTargetFunctionName: "job-executor",
});
```

**Always `create`, never `new`.** The constructors are private precisely so that this file
is the only seam. Never declare a second handle for a resource that already has one. A
table handle is imported only by that table's repository (`repositories.md`); a
bucket, cache or job handle may be imported wherever it is needed:

```ts
// packages/repositories/src/todo-repository.ts
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { todoTable } from "@/resources";

const storedTodo = await todoTable.runIn(CatalystScope.User).getRow(todoId);
```

It lives in a package rather than in an app because the web app is one deployable among
however many a solution grows, and two of them reaching the same table must not name it
twice. It is not in `catalyst-node` because the handles name this solution's resources, and
that package wraps the SDK for any solution (`repositories.md`).

The four factories differ, because the resources do:

| Factory | Argument |
|---|---|
| `Table.create<Row>("Todo")` | the table name, where `Row` declares its columns - see below |
| `Bucket.create("invoices")` | the bucket name |
| `Cache.create()` | a segment **id**, not a name - omit it for the project default segment |
| `Job.create<T>({ jobName, aliasName, jobPoolName, jobTargetFunctionName })` | a config object, where `T` types the job's params and `aliasName` is 1-20 letters, digits or underscores - Catalyst sends it as `job_name` and rejects a hyphen |

`jobTargetFunctionName` is the function the job pool invokes. There is no default: a job
that does not say what runs it is a deploy-time failure nothing catches, so every job names
its own. Several jobs may share one executor, which dispatches on the `jobName` carried in
the params.

Both methods take a single object. `submitJob` queues the job now; `submitOneTimeCron`
schedules it. `timeOfExecution` is epoch milliseconds, as `Date.getTime()` gives, and the
wrapper sends Catalyst the seconds it reads; a time below 2001 is taken for seconds passed by
mistake and throws. `cronName` is required; keep it to letters, digits and underscores - a
precaution, since only `job_name`'s rule is confirmed - and keep it unique yourself: Catalyst
does not enforce that, so a caller that must not schedule twice marks its own record:

```ts
await reminderJob.submitJob({ params: { todoId: "1" } });
await reminderJob.submitOneTimeCron({
  timeOfExecution: runAt,          // epoch milliseconds
  params: { todoId: "1" },
  cronName: "remind_0001",
});
```

A job that takes no params is `Job<void>` - the generic's default - and then the `params`
key is gone rather than empty, and `submitJob` takes no argument at all:

```ts
export const nightlyReportJob = Job.create({
  jobName: "nightly_report",
  aliasName: "nightly_report",
  jobPoolName: "default",
  jobTargetFunctionName: "report-executor",
});

await nightlyReportJob.submitJob();
await nightlyReportJob.submitOneTimeCron({ timeOfExecution: runAt, cronName: "nightly_01" });
```

The generic decides which, so the two cannot be confused: passing a payload to a void job,
or omitting one from a typed job, is a compile error.

### Declaring a table's row

`Row` is an interface keyed by the Catalyst column names - `TITLE`, not `title` - exported
beside the handle as `<Table>Row`, because the table's repository maps from it. It is the only
place a table's columns are written down. Everything else is derived from it:

| Call | Takes | Returns |
|---|---|---|
| `insertRow` / `insertRows` | `Row` | `StoredRow<Row>` |
| `updateRow` / `updateRows` | `RowUpdate<Row>` - any subset of `Row`, plus `ROWID` | `StoredRow<Row>` |
| `getRow` / `getPagedRows` | a `ROWID` / a page token | `StoredRow<Row>` - `getRow` gives `undefined` when no row has that ROWID, which Catalyst answers with `null`; any rejection throws `CatalystError` |

- **A non-optional property is a mandatory column.** Leaving it out of an insert is a
  compile error; an optional property (`NOTES?`) may be left out.
- **A key `Row` does not declare is a compile error** in an object literal.
- `StoredRow<Row>` adds the four system columns every table carries - `ROWID`, `CREATORID`,
  `CREATEDTIME`, `MODIFIEDTIME`, all strings - and types an optional column as `T | null`,
  because Catalyst returns an unset column as `null`, not as a missing key.
- `create`'s generic defaults to `never`, so a handle declared without its row accepts no
  row at all rather than any row.

ZCQL names columns through the handle, so a typo is a compile error there too:

```ts
const table = todoTable;
`SELECT COUNT(${table.column("ROWID")}) FROM ${table.name}`             // COUNT(ROWID)
`SELECT COUNT(${table.qualifiedColumn("ROWID")}) FROM ${table.name}`    // COUNT(Todo.ROWID)
rows[0]?.[table.name]?.[table.column("TITLE")]                          // read a result
```

Use `qualifiedColumn` once a query joins a second table. A ZCQL result is a `ZcqlRow` -
each table's columns under that table's name, exactly as Catalyst sends them, so a column
two joined tables share (`ROWID`) is never lost to the other. A query picks its own
columns, so no row type describes them. Two shapes to know: an aggregate's key depends on
the path - through the SDK `COUNT(ROWID)` reads back as `COUNT(ROWID)`, through the REST API
(and the MCP) as `ROWID` - so read it by position, never by name, or it silently reads as 0;
and `DELETE` answers `{ Table: { DELETED_ROWS_COUNT } }`.

```ts
const [countRow] = await Zcql.runIn(CatalystScope.User).executeQuery(
  `SELECT COUNT(${table.column("ROWID")}) FROM ${table.name}`,
);
const todoCount = Number(Object.values(countRow?.[table.name] ?? {})[0] ?? 0);
```

A statement returns at most 300 rows, so a read that can exceed that pages with
`LIMIT <first row>, <count>` - and the first row counts **from 1**: `LIMIT 1, 300`, then
`LIMIT 301, 300`. A 0-based offset (`LIMIT 300, 300`) reads row 300 twice.

`Zcql` is the exception and has no handle. A query joins across tables and belongs to no
single one, so it is static and starts from `runIn` -
`Zcql.runIn(CatalystScope.User).executeQuery("SELECT ...")`.

**Every value goes in as a `?`, with the values passed beside the statement** - never
written into the statement. ZCQL has no bound parameters of its own, so `executeQuery` binds
them: a value with a quote in it would otherwise end the literal and rewrite the query.

```ts
await Zcql.runIn(CatalystScope.User).executeQuery(
  `SELECT ${table.column("ROWID")} FROM ${table.name} WHERE ${table.column("TITLE")} = ?`,
  [title],
);
```

- Table and column names come from the handle and go in the template; they are never a
  caller's input.
- A string is quoted with each quote inside doubled - ZCQL's only escape; a backslash is an
  ordinary character. A number goes in as written, and one that is not finite throws.
- `null` goes in as `NULL`, which `SET` and `INSERT` take. In a filter it is the caller's
  call: as in SQL, `NOTES = NULL` matches no row and `NOTES IS NULL` is the test for an unset
  column.
- Every `?` in the statement is a placeholder, one inside a quoted literal included, so a
  constant with a `?` in it goes in as a value too: `LIKE ?` with `["*?*"]`, never
  `LIKE '*?*'`.
- A count of values that does not match the `?`s throws before any call.
- The error from a failed query never carries the statement, since it holds the values.

This is a starter kit, so it ships no resources. `@repo/repositories` and its `resources.ts`
arrive with the first one.

## A handle is hoisted, a client is not

Two objects, two opposite rules, and only one of them has a security consequence.

The **handle** - `todoTable`, `invoiceBucket` - holds a name. Hoisting it to module scope
is the whole point of `resources.ts`.

The **SDK client** - `Datastore`, `Stratus`, `Cache`, `JobScheduling` - is built from the
per-request app, which carries the caller's credentials. **Call the accessor per use, and
never assign a client or an app to a module-level `const`**, or one held across requests
serves another user's data.

That is why every accessor is a function that reads `CatalystSession.app(scope)` again on
every call, and it is what makes the handle safe to hoist. Nothing structural enforces it -
the accessors live in five files - so check it when reviewing a wrapper.

## One app per scope, per request

The app is built from a request's headers - its project details and the caller's
credentials - so it belongs to that request alone. It lives on the request's execution
context (`@repo/async-context`), which `AsyncLocalStorage` keeps apart for every request in
flight. `CatalystSession` (`catalyst-session.ts`) is the only code that puts it there or
reads it back:

- `await CatalystSession.setApp(headers, scope)` builds one scope's app with `zcAuth.init`
  and sets it on the context in flight. The entry point calls it once, up front, for every
  scope its code uses.
- `CatalystSession.app(scope)` returns the app the entry point set. Every wrapper accessor
  calls it, on every call.

Apps are not built on first use. A wrapper that asks for a scope the entry point did not
set throws `CatalystError` (`SCOPE_UNAVAILABLE`), and one called outside an execution
context throws `AsyncContextError`. The same wrappers then serve a Next.js page or Server
Action, an Express route or a Catalyst function - each entry point sets the apps from the
headers it has, and no call passes them along.

```tsx
// apps/web/src/app/(app)/page.tsx - withCatalystPage sets the User app; the page calls the wrapper
export default withCatalystPage([CatalystScope.User], async function HomePage() {
  const user = await UserManagement.currentUser();
  ...
});
```

A scope `setApp` cannot build - User, when the request carries no signed-in user - rejects
with `CatalystError` (`SCOPE_UNAVAILABLE`), holding only the SDK's code and message: the
SDK's own error carries the request headers, credential tokens included, so it is never
attached or logged. In `apps/web`, `withCatalystPage` and `withCatalystFn` let it throw
before the page or action runs; `src/proxy.ts` has already sent a signed-out visitor to
`/sign-in` (`nextjs/code-placement.md`). An API app's `initCatalystScopes([...])` turns a User
failure into a 401 (`node-api/express-app.md`). An Admin failure throws, and an API app
answers it with a 500.

**Never hold an app at module scope** or store it on a handle. It is the one object here
that carries a caller's credentials, so one kept past its request serves another user's
data. Read it through `CatalystSession.app` at the point of use and let it go.

User scope covers only the methods the browser SDK exposes
(https://docs.catalyst.zoho.com/en/sdk/javascript/v1/webpack-bundler/#browser-supported-javascript-methods);
everything else needs Admin. Use User unless the method is missing from the browser list.
Cache and Job Scheduling are admin-only, so their handles always use the Admin app.

**A Table, Bucket or Zcql call starts from `runIn(scope)`.** These handles expose only
`runIn`, which returns the operations bound to that scope (`ScopedTable`, `ScopedBucket`,
`ScopedZcql`). Skipping it is a compile error, not a default, so every call names whose
credentials it uses. Cache and Job have a fixed scope, so their methods sit on the handle
itself:

```ts
await todoTable.runIn(CatalystScope.User).insertRow(row);
await Zcql.runIn(CatalystScope.Admin).executeQuery("SELECT ...");
await sessionCache.getValue(key);
```

`runIn` returns a new object and never mutates the handle. The handle is a module-level
singleton shared by every request, so it holds a name and a scope at most - never an app.
A method that makes no Catalyst call - `Bucket.buildKey` - stays on the handle. The scoped
classes are exported as types only, so `runIn` is the only way to build one.

**Never construct an SDK client without an app.** `new CacheClient()` does not fail: the SDK
falls back to a module-level default holding whichever request called `zcAuth.init` last,
and switches that request's credential to admin while it is still in flight.

## Fewest calls

Every Catalyst call is a network round trip, billed and rate-limited. **A solution makes
the fewest calls that answer the question**, and a review asks how many each path makes.

- **One statement, not read-then-act.** Delete or update by the column you already have,
  in a single ZCQL statement, rather than selecting the ROWID first:

  ```ts
  await Zcql.runIn(CatalystScope.Admin).executeQuery(
    `DELETE FROM ${table.name} WHERE ${table.column("TITLE")} = ?`,
    [title],
  );
  ```

  ZCQL answers `DELETE` with `DELETED_ROWS_COUNT`, so the statement also says whether
  anything was there.
- **No existence check before a read that already reports absence.** If the read throws
  or returns nothing when the row is missing, that is the check - asking twice costs a
  second round trip and can disagree with the first.
- **Select only the columns you use, and `LIMIT` what you expect one of.**
- **Bulk over loops.** `insertRows`, `updateRows` and `deleteRows` take an array; a loop of
  single-row calls is N round trips for one change.
- **Read once per execution.** Something every call in a request needs - the caller, a
  configuration row - is read once and kept in the execution extras
  (`manager.setExtras`).
- **Cache before Catalyst Cache.** A value safe to keep across requests sits in an
  in-process LRU first, so a hit costs no call at all; Catalyst Cache is the fallback
  shared across instances.

A path that has to make several calls should say so in a comment, so the next reader
does not "optimise" a call that is load-bearing.

## A missing capability is a new method

**When a caller needs something the wrapper does not do yet, add the method to the
wrapper.** Never reach past it - not to the SDK, not to `CatalystSession.app`, not with
a one-off client built at the call site. The ESLint boundary stops the import, but the
rule is about intent: the point of `packages/catalyst-node/src/` is that one directory answers
what this repo asks of Catalyst, and a capability used from a page or a route is invisible
there.

So `listObject` on `Bucket`, `getPagedRows` on `Table`, `submitOneTimeCron` on `Job` -
each arrived because something needed it. Add the next one the same way, following the
rules above, and call it from where it is needed:

```ts
// packages/catalyst-node/src/bucket.ts - on ScopedBucket
async copyObject(sourceKey: string, targetKey: string): Promise<void> {
  ...
}

// apps/web/src/invoice/invoices.ts
await invoiceBucket.runIn(CatalystScope.User).copyObject(draftKey, finalKey);
```

A method that turns out to be single-use is still the right shape. It costs one small
function and keeps the seam whole.

How a wrapper in `packages/catalyst-node` is written - what it takes and returns, its errors,
and how it types an SDK that exports almost nothing - is `catalyst-wrappers.md`.
