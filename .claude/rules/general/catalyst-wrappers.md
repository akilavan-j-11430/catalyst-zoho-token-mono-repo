---
paths:
  - "packages/catalyst-node/**"
---

# Writing a Catalyst wrapper

How the code inside `packages/catalyst-node` is written. What every caller needs - handles,
scopes, `runIn`, fewest calls - is `catalyst-sdk.md`.

## Writing a wrapper

One file per component, flat under `packages/catalyst-node/src/`. A wrapper exists to give this
repo's vocabulary to a Catalyst call, so:

- Take and return plain values - `string`, `Readable`, a domain type. Never hand an SDK
  object back to a caller, or the seam leaks.
- Throw `CatalystError` (`@/catalyst-error`) with an `ErrorCode`, never a raw SDK
  error.
- Validate what Catalyst will reject anyway - a TTL under 60s, a job alias with a hyphen -
  before spending the round trip.
- Keep the constructor `private` and expose a `static create(...)`, so construction stays
  in `resources.ts`.

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
const scheduling = jobScheduling();
await scheduling.JOB.submitJob(job as unknown as SdkJobMeta);
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
