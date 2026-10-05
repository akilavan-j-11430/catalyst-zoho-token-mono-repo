# Catalyst SDK access

Every Catalyst SDK call goes through `packages/node-utils/src/services/catalyst/`. No
`@zcatalyst/*` package may be imported anywhere else, and ESLint enforces it.

One file per component - `bucket.ts`, `table.ts`, `zcql.ts`, `cache.ts`, `job.ts` - plus
`resources.ts`, which names the resources. Each component builds the SDK client
it needs itself, in a module-private accessor at the top of the file, and reaches for the
app nowhere else:

```ts
// packages/node-utils/src/services/catalyst/bucket.ts
import { Stratus } from "@zcatalyst/stratus";
import type { CatalystScope } from "@/enums/catalyst-scope";
import { currentContext } from "@/framework/async-context";

function stratus(scope: CatalystScope): Stratus {
  return new Stratus(currentContext().manager.catalyst.getApp(scope));
}
```

That is what the directory buys: one place to read to know everything this repo asks of
Catalyst, and a boundary ESLint can name.

## Reaching a resource

A wrapper instance is a **handle**: it holds a name and nothing else. Build it once, at
module scope, in `resources.ts` - one `export const` per Catalyst resource this repo uses,
and the only place a wrapper is ever constructed:

```ts
// packages/node-utils/src/services/catalyst/resources.ts
import { Bucket } from "@/services/catalyst/bucket";
import { Cache } from "@/services/catalyst/cache";
import { Job } from "@/services/catalyst/job";
import { Table } from "@/services/catalyst/table";

export const todoTable = Table.create<{
  TITLE: string;
  NOTES?: string;
}>("Todo");
export const invoiceBucket = Bucket.create("invoices");
export const sessionCache = Cache.create();
export const reminderJob = Job.create<{ todoId: string }>({
  jobName: "reminder",
  aliasName: "reminder",
  jobPoolName: "default",
  jobTargetFunctionName: "job_executor",
});
```

**Always `create`, never `new`.** The constructors are private precisely so that this file
is the only seam. Import the handle wherever it is needed, and never declare a second one
for a resource that already has one:

```ts
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { todoTable } from "@repo/node-utils/services/catalyst/resources";

const todo = await todoTable.runIn(CatalystScope.User).getRow(rowId);
```

It lives here rather than in an app because `apps/api` is one AppSail among however many a
solution grows, and two apps reaching the same table must not name it twice.

The four factories differ, because the resources do:

| Factory | Argument |
|---|---|
| `Table.create<Row>("Todo")` | the table name, where `Row` declares its columns - see below |
| `Bucket.create("invoices")` | the bucket name |
| `Cache.create()` | a segment **id**, not a name - omit it for the project default segment |
| `Job.create<T>({ jobName, aliasName, jobPoolName, jobTargetFunctionName })` | a config object, where `T` types the job's params and `aliasName` may not exceed 20 characters |

`jobTargetFunctionName` is the function the job pool invokes. There is no default: a job
that does not say what runs it is a deploy-time failure nothing catches, so every job names
its own. Several jobs may share one executor, which dispatches on the `jobName` carried in
the params.

Both methods take a single object. `submitJob` queues the job now; `submitOneTimeCron`
schedules it, and its `cronName` is required, unique in the project, and capped at 20
characters like the alias:

```ts
await reminderJob.submitJob({ params: { todoId: "1" } });
await reminderJob.submitOneTimeCron({
  timeOfExecution: runAt,          // epoch milliseconds
  params: { todoId: "1" },
  cronName: "remind-0001",
});
```

A job that takes no params is `Job<void>` - the generic's default - and then the `params`
key is gone rather than empty:

```ts
export const nightlyReportJob = Job.create({
  jobName: "nightly_report",
  aliasName: "nightly_report",
  jobPoolName: "default",
  jobTargetFunctionName: "report_executor",
});

await nightlyReportJob.submitJob({});
await nightlyReportJob.submitOneTimeCron({ timeOfExecution: runAt, cronName: "nightly-01" });
```

The generic decides which, so the two cannot be confused: passing a payload to a void job,
or omitting one from a typed job, is a compile error.

### Declaring a table's row

`Row` is an object type keyed by the Catalyst column names - `REFERENCE_ID`, not
`referenceId` - written inline in `create`, and it is the only place a table's columns are
written down. Name it as an exported interface beside the handle only when a second caller
needs the type itself. Everything else is derived from it:

| Call | Takes | Returns |
|---|---|---|
| `insertRow` / `insertRows` | `Row` | `StoredRow<Row>` |
| `updateRow` / `updateRows` | `RowUpdate<Row>` - any subset of `Row`, plus `ROWID` | `StoredRow<Row>` |
| `getRow` / `getPagedRows` | a `ROWID` / a page token | `StoredRow<Row>` |

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
rows[0]?.[table.column("TITLE")]                                        // read a result
```

Use `qualifiedColumn` once a query joins a second table. A ZCQL result is still `ZcqlRow`
(`Record<string, unknown>`) - a query picks its own columns, so no row type describes it.

`Zcql` is the exception and has no handle. A query joins across tables and belongs to no
single one, so it is static and starts from `runIn` -
`Zcql.runIn(CatalystScope.User).executeQuery("SELECT ...")`.

`resources.ts` exists and declares two: `zohoConnectionTable` for the `ZohoConnection` table
and `zohoConnectionCache` for the project's default cache segment. Note the segment carries two
kinds of entry - minted access tokens and OAuth state - told apart by a key prefix rather than
by a second handle, because they are one Catalyst resource.

## A handle is hoisted, a client is not

Two objects, two opposite rules, and only one of them has a security consequence.

The **handle** - `todoTable`, `invoiceBucket` - holds a name. Hoisting it to module scope
is the whole point of `resources.ts`.

The **SDK client** - `Datastore`, `Stratus`, `Cache`, `JobScheduling` - is built from the
per-request app, which carries the caller's credentials. **Call the accessor per use, and
never assign a client to a module-level `const`**, or one held across requests serves
another user's data.

That is why every accessor is a function and every method calls it again, and it is what
makes the handle safe to hoist. Nothing structural enforces it - the accessors live in five
files - so check it when reviewing a wrapper.

## One app per scope

User scope covers only the methods the browser SDK exposes
(https://docs.catalyst.zoho.com/en/sdk/javascript/v1/webpack-bundler/#browser-supported-javascript-methods);
everything else needs Admin. So the context carries a `Catalyst` (`catalyst.ts`) holding one
app per `CatalystScope`, and `initExecutionContext` builds every scope from the request's
headers. A scope that cannot be built - User, when the request carries no signed-in user -
is left unset, and `getApp(scope)` throws `CatalystError` with `SCOPE_UNAVAILABLE` only when
something asks for it.

Use User unless the method is missing from the browser list. Cache is admin-only.

**Table, Bucket and Zcql take the scope at the call site, never in `resources.ts`.** A handle
holds a name and exposes only `runIn(scope)`, which returns the scoped operations
(`ScopedTable`, `ScopedBucket`, `ScopedZcql`). Skipping it is a compile error, not a
default, so every call names whose credentials it uses:

```ts
await zohoConnectionTable.runIn(CatalystScope.User).insertRow(row);
await Zcql.runIn(CatalystScope.Admin).executeQuery("SELECT ...");
```

`runIn` returns a new object and never mutates the handle. The handle is a module-level
singleton shared by every request, so a scope stored on it would leak across concurrent
requests. A method that makes no Catalyst call - `Bucket.buildKey` - stays on the handle.
The scoped classes are exported as types only, so `runIn` is the only way to build one.

**Never construct an SDK client without an app.** `new CacheClient()` does not fail: the SDK
falls back to a module-level default holding whichever request called `zcAuth.init` last,
and switches that request's credential to admin while it is still in flight.

## Writing a wrapper

One file per component, flat under `services/catalyst/`. A wrapper exists to give this
repo's vocabulary to a Catalyst call, so:

- Take and return plain values - `string`, `Readable`, a domain type. Never hand an SDK
  object back to a caller, or the seam leaks.
- Throw `CatalystError` (`@/errors/catalyst-error`) with an `ErrorCode`, never a raw SDK
  error.
- Validate what Catalyst will reject anyway - a TTL under 60s, an alias over 20 chars -
  before spending the round trip.
- Keep the constructor `private` and expose a `static create(...)`, so construction stays
  in `resources.ts`.

## A missing capability is a new method

**When a route needs something the wrapper does not do yet, add the method to the
wrapper.** Never reach past it - not to the SDK, not to the app on the context, not with
a one-off client built at the call site. The ESLint boundary stops the import, but the
rule is about intent: the point of `services/catalyst/` is that one directory answers
what this repo asks of Catalyst, and a capability used from a route is invisible there.

So `listObject` on `Bucket`, `getPagedRows` on `Table`, `submitOneTimeCron` on `Job` -
each arrived because something needed it. Add the next one the same way, following the
rules above, and call it from the route:

```ts
// packages/node-utils/src/services/catalyst/bucket.ts - on ScopedBucket
async copyObject(sourceKey: string, targetKey: string): Promise<void> {
  ...
}

// apps/api/src/routes/invoice.ts
await invoiceBucket.runIn(CatalystScope.User).copyObject(draftKey, finalKey);
```

A method that turns out to be single-use is still the right shape. It costs one small
function and keeps the seam whole.

## The SDK exports almost nothing

`@zcatalyst/*` packages export only their top-level client. `Bucket`, `Table`, `Segment`
and every payload type are internal. Derive what you need from the method that produces
it rather than deep-importing a built file, which would break on any upgrade:

```ts
type CatalystBucket = ReturnType<Stratus["bucket"]>;
type SubmitInput = Parameters<JobScheduling["JOB"]["submitJob"]>[0];
```

**Never import from `dist-es/`, `dist-cjs/` or `dist-types/`.** Those are build artefacts,
not an API, and a reader who finds one cannot tell whether it is load-bearing.

That rule costs something, and the cost is worth knowing. The SDK's enums are reachable
nowhere else: `CRON_TYPE` and `TARGET_TYPE` are re-exported from no package root, their
values ship in `dist-es/` with no declarations beside them, and their declarations sit in
`dist-types/` with no JS behind them - so `dist-types` type-checks and then throws at
runtime, while `dist-es` runs as an implicit `any`. Reaching them at all takes a
`declare module` bridging the two directories.

Do not build that bridge. **Name the wire shape this repo sends and cast once, at the
call.** The payload stays fully checked, the vendor's build layout stays irrelevant, and
what Catalyst receives is readable in one place:

```ts
interface FunctionJobRequest {
  job_name: string;
  jobpool_name: string;
  target_type: "Function";
  target_name: string;
  params: JobParams;
}

const job: FunctionJobRequest = { ... };
await jobScheduling().JOB.submitJob(job as unknown as SdkJobMeta);
```

`job.ts` is the worked example. The cast is the seam: it is the one place the SDK's
declared type and the shape Catalyst actually accepts are allowed to disagree.

## Known rough edges in the modular SDK

- `createCron` takes `ICatalystCronDetails`, its *response* shape, so its declared input
  demands `id`, `end_time`, `cron_execution_type` and an expanded `job_meta` that only the
  server produces. No valid request satisfies it.
- `submitJob` is declared against `TCatalystJobs`, whose `target_type` is a TS enum member
  - and a string literal is never assignable to one, so even a correct payload is
  rejected. Both are why `job.ts` casts at the call.
- `@zcatalyst/zcql` is at **0.0.2** while the rest are 1.0.0. It is the least settled
  dependency here; expect its API to move. `zcql.ts` goes through `Datastore` instead.
- `getSegmentDetails(id)` and `segment(id)` take a segment **id**, not a name.
