---
paths:
  - "apps/*/src/job-dispatcher.ts"
  - "apps/*/src/jobs/**"
---

# Job function

A Job function runs the work a `Job` handle submits (`catalyst-sdk.md`). One function
serves every job that names it as `jobTargetFunctionName`. It reads `jobName` from the
params and runs the matching job.

Creating the workspace, its bundle, `catalyst.json` and the `deploy` flag is covered in
the `add-job-fn` skill. This file covers the function's wiring; where a job's work goes and
how it checks its params is `code-placement.md`.

Cron functions are deprecated and not used. To run a job once, later, use
`submitOneTimeCron` on its `Job` handle; to run one on a schedule, see "A recurring job".

## Layout

```
apps/<name>/
  src/index.ts              the function - `module.exports = handler`, the only bundle entry
  src/job-dispatcher.ts     JobDispatcher - checks jobName, picks the job, runs it
  src/jobs/<job-name>.ts    one class per job, named after its jobName
  src/<area>/<areas>.ts     work two jobs share - `code-placement.md`
  src/dev-server.ts         local only - POST /:jobName runs the dispatcher
  src/<name>-path.ts        the dev server's path segments - `general/routing.md`
  catalyst-config.json      from `catalyst functions:add --type job`
```

`index.ts` and `dev-server.ts` are two ways into the same work, so the dispatch lives in
its own file and both call it. Nothing else runs a job.

## The params

Catalyst carries a job's params as strings (`JobParams`, `Record<string, string>`).
Every job's params hold:

| Key | | Set by |
|---|---|---|
| `jobName` | required - picks the job | `Job.submitJob` and `Job.submitOneTimeCron`, from the handle's `jobName` |
| `jobId` | optional - identifies one run in the logs | `Job.submitJob`, a UUID unless the caller passes one |

**A run without `jobName` throws**, and so does one whose `jobName` no job claims. The
function then closes as failed, so a bad submission shows up in the job's history
instead of finishing as a silent success.

## The dispatcher

```ts
// src/job-dispatcher.ts
import type { JobParams } from "@repo/catalyst-node/job";
import { reminderJob } from "@repo/catalyst-node/resources";
import { Logger } from "@repo/logger/logger";
import { ReminderJob } from "@/jobs/reminder";

/** Strategy: runs the job a submission names. */
export class JobDispatcher {
  private static readonly logger = Logger.for("job-dispatcher");
  private static readonly jobs: Record<
    string,
    (params: JobParams) => Promise<void>
  > = {
    [reminderJob.config.jobName]: ReminderJob.run,
  };

  static async run(params: JobParams): Promise<void> {
    const { jobName, jobId } = params;
    if (!jobName) {
      throw new Error("Job params carry no jobName.");
    }
    const job = JobDispatcher.jobs[jobName];
    if (!job) {
      throw new Error(`No job is registered for jobName "${jobName}".`);
    }
    JobDispatcher.logger.info(`Running job ${jobName} (${jobId ?? "no jobId"})`);
    await job(params);
  }
}
```

- **Keys come from the handle**, `reminderJob.config.jobName`, never from a string
  literal. The name then lives only in `resources.ts`, and a typo is a compile error.
- **Adding a job** takes one file in `src/jobs/`, one line in `jobs`, and its `Job.create`
  in `resources.ts`, with this function as `jobTargetFunctionName`.

## A job

A class in `src/jobs/<job-name>.ts`, named after its jobName in kebab-case, with a
`static async run(params)` - `ReminderJob` in `code-placement.md` is the example, with how it
parses its params and where its work goes.

- **Its params are strings it checks itself.** A param typed on the handle
  (`Job.create<{ todoId: string }>`) is still a string, and the dispatcher only knows
  `jobName`.
- **It reaches Catalyst the way a route does**, through repositories and handles, which read
  the app the entry point set. No signed-in user starts a job, so that is the Admin app only,
  and a wrapper that asks for User throws `SCOPE_UNAVAILABLE`. `Job` itself uses Admin, so a
  job can submit another job.
- **A retry runs it again.** Catalyst can rerun a failed job, so a job must be safe to run
  twice for the same params.

## The entry point

```ts
// src/index.ts
import { randomUUID } from "node:crypto";
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { CatalystSession } from "@repo/catalyst-node/catalyst-session";
import type { JobParams } from "@repo/catalyst-node/job";
import { ExecutionContext, runWithContext } from "@repo/async-context/async-context";
import { CatalystLogOutput } from "@repo/logger/catalyst-log-output";
import { Logger } from "@repo/logger/logger";
import { JobDispatcher } from "@/job-dispatcher";

Logger.configure({ output: CatalystLogOutput });
const logger = Logger.for("job-executor");

/** What Catalyst passes a Job function - `types/job.d.ts` from `functions:add` lists it all. */
interface JobRequest {
  getAllJobParams(): JobParams;
}

/** `catalystHeaders` carries what a request's headers carry: the project and the credentials. */
interface JobContext {
  catalystHeaders: Record<string, string | number>;
  closeWithSuccess(): void;
  closeWithFailure(): void;
}

async function handler(jobRequest: JobRequest, context: JobContext): Promise<void> {
  const execution = new ExecutionContext({ executionId: randomUUID(), extras: {} });
  try {
    await runWithContext(execution, async () => {
      await CatalystSession.setApp(context.catalystHeaders, CatalystScope.Admin);
      await JobDispatcher.run(jobRequest.getAllJobParams());
    });
    await CatalystLogOutput.flush();
    context.closeWithSuccess();
  } catch (error) {
    logger.error(error);
    await CatalystLogOutput.flush();
    context.closeWithFailure();
  }
}

module.exports = handler;
```

- **Every run ends in `closeWithSuccess()` or `closeWithFailure()`.** A run that is never
  closed waits out the 15-minute limit and is then marked failed.
- Neither file imports `@zcatalyst/*`: `CatalystSession.setApp` builds the app, so the
  function needs no `allowCatalystSdk`.
- The export, the execution context, the apps and the logger are the same for every function -
  `function-entry-point.md` explains each.

## The dev server

Locally, a job runs from an HTTP call, with no job pool and no deploy. `src/dev-server.ts`
is a small Express app that takes the jobName from the path and the rest of the params
from the body, then calls the same `JobDispatcher.run` as the deployed function:

```ts
// src/dev-server.ts - local only, never imported by index.ts, so never bundled
import express from "express";
import { randomUUID } from "node:crypto";
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { CatalystSession } from "@repo/catalyst-node/catalyst-session";
import { ExecutionContext, runWithContext } from "@repo/async-context/async-context";
import { JobDispatcher } from "@/job-dispatcher";
import { JobExecutorPath } from "@/job-executor-path";

const app = express();
app.use(express.json());
app.post(JobExecutorPath.JobExecutor + JobExecutorPath.JobName, async (req, res) => {
  const execution = new ExecutionContext({ executionId: randomUUID(), extras: {} });
  await runWithContext(execution, async () => {
    await CatalystSession.setApp(req.headers, CatalystScope.Admin);
    await JobDispatcher.run({ ...req.body, jobName: req.params.jobName, jobId: randomUUID() });
  });
  res.json({ jobName: req.params.jobName });
});
app.listen(8100);
```

- **It builds its execution context and sets the Admin app exactly as `index.ts` does**,
  from the request's headers instead of `catalystHeaders`. It needs no shared Express
  plumbing; a throw reaches Express's default handler, which answers 500.
- **Its paths live in its own `src/<name>-path.ts`**, as for any app that serves HTTP
  (`general/routing.md`). That file holds the prefix (`JobExecutor: "/job-executor"`) and
  the parameter (`JobName: "/:jobName"`).
- **It is reached through the proxy.** `apps/proxy` routes the prefix to the dev port
  (`general/routing.md`), so the headers `catalyst serve` injects reach `setApp`. Without
  them the Admin app cannot be built.
- `express` is a `devDependency`. The bundle installs `dependencies` only, and
  `dev-server.ts` is never bundled.
- `"dev": "tsx watch --env-file-if-exists=.env src/dev-server.ts"`,
  on its own port from 8100 up. `pnpm dev` then starts it with everything else.

```bash
curl -X POST http://localhost:3001/job-executor/reminder \
  -H 'content-type: application/json' -d '{"todoId":"1"}'
```

The dev server is the local loop - not `catalyst functions:execute`. It proves the job
logic; a real submission still has to be checked after deploying, because it does not
exercise the job pool, the deployed environment or the timing.

## A recurring job

A job that runs on a schedule - nightly, every five minutes - runs from a cron set up once
per environment in the Console (**Job Scheduling -> Cron**) or through the Catalyst MCP
(`CatalystbyZoho_Create_Cron_Job`), like a table. No code creates it at runtime.

- **Type:** Calendar for a fixed clock time (daily, monthly, yearly), Cron Expression for
  anything else. Periodic fires once the moment it is created or updated.
- **Target:** this function, in the job pool its handles name.
- **Params: `jobName` is required.** A cron's own job name is not passed to the function,
  so the dispatcher sees only what the cron's params hold. Put the handle's `jobName` there,
  plus whatever the job parses.
- **Set it up in each environment** - Development and Production keep their own crons - and
  write it down beside the job's handle in `resources.ts`, as a comment naming the cron and
  its schedule, so a reader of the code knows it exists.
- **Never put a secret in its params.** Reading a cron back returns its params in plain text.

## Limits

- 15 minutes per run. Longer work belongs in an AppSail.
- The function's memory must not exceed its job pool's, or every submission is rejected
  with `INVALID_INPUT`.

## Tests

Following `testing.md`, test `JobDispatcher.run` and each job's `run` directly:
- a missing jobName throws
- an unknown jobName throws
- each job checks its own params
- each job calls the repositories it should, which are faked
