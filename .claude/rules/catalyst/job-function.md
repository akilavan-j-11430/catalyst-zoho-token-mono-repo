# Job function

A Job function runs the work a `Job` handle submits (`catalyst-sdk.md`). One function
serves every job that names it as `jobTargetFunctionName`. It reads `jobName` from the
params and runs the matching job.

Creating the workspace, its bundle, `catalyst.json` and the `deploy` flag is covered in
the `add-job-fn` skill. This file covers what goes inside.

Cron functions are deprecated and not used. To run a job later, use
`submitOneTimeCron` on its `Job` handle.

## Layout

```
apps/<name>/
  src/index.ts              the function - `module.exports = handler`, the only bundle entry
  src/job-dispatcher.ts     JobDispatcher - checks jobName, picks the job, runs it
  src/jobs/<job-name>.ts    one class per job, named after its jobName
  src/dev-server.ts         local only - POST /:jobName runs the dispatcher
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
import type { JobParams } from "@repo/node-utils/catalyst/job";
import { reminderJob } from "@repo/node-utils/catalyst/resources";
import { RuntimeError } from "@repo/node-utils/errors/runtime-error";
import { logger } from "@repo/node-utils/framework/logger";
import { ReminderJob } from "@/jobs/reminder";

/** Strategy: runs the job a submission names. */
export class JobDispatcher {
  private static readonly jobs: Record<string, (params: JobParams) => Promise<void>> = {
    [reminderJob.config.jobName]: ReminderJob.run,
  };

  static async run(params: JobParams): Promise<void> {
    const { jobName, jobId } = params;
    if (!jobName) {
      throw new RuntimeError("Job params carry no jobName.");
    }
    const job = JobDispatcher.jobs[jobName];
    if (!job) {
      throw new RuntimeError(`No job is registered for jobName "${jobName}".`);
    }
    logger.info(`Running job ${jobName} (${jobId ?? "no jobId"})`);
    await job(params);
  }
}
```

- **Keys come from the handle**, `reminderJob.config.jobName`, never from a string
  literal. The name then lives only in `resources.ts`, and a typo is a compile error.
- **Adding a job** takes one file in `src/jobs/`, one line in `jobs`, and its `Job.create`
  in `resources.ts`, with this function as `jobTargetFunctionName`.

## A job

```ts
// src/jobs/reminder.ts
import type { JobParams } from "@repo/node-utils/catalyst/job";
import { RuntimeError } from "@repo/node-utils/errors/runtime-error";

/** Sends the reminder for one todo. */
export class ReminderJob {
  static async run(params: JobParams): Promise<void> {
    const { todoId } = params;
    if (!todoId) {
      throw new RuntimeError("Reminder job needs a todoId.");
    }
    // repositories and handles from node-utils, as a route would call them
  }
}
```

- **One class per job**, with a `static async run(params)`. The file is named after the
  jobName in kebab-case.
- **Check its own params first.** A param typed on the handle (`Job.create<{ todoId:
  string }>`) is still a string the job has to check: the dispatcher only knows `jobName`.
- **It reaches Catalyst the way a route does**, through repositories and handles. Only
  Admin is available, as described below.
- **Only Admin is available.** No signed-in user starts a job, so a wrapper that asks for
  User throws `SCOPE_UNAVAILABLE`. That includes `Job`'s own accessor, so a job that
  submits another job needs an Admin path added to `job.ts` first.
- **A retry runs it again.** Catalyst can rerun a failed job, so a job must be safe to run
  twice for the same params.

## The entry point

```ts
// src/index.ts
import { randomUUID } from "node:crypto";
import { zcAuth } from "@zcatalyst/auth";
import type { JobParams } from "@repo/node-utils/catalyst/job";
import { Catalyst } from "@repo/node-utils/catalyst/catalyst";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { ExecutionContext, runWithContext } from "@repo/node-utils/framework/async-context";
import { logger } from "@repo/node-utils/framework/logger";
import { JobDispatcher } from "@/job-dispatcher";

/** What Catalyst passes a Job function - `types/job.d.ts` from `functions:add` lists it all. */
interface JobRequest {
  getAllJobParams(): JobParams;
}

/** `catalystHeaders` is what `zcAuth.init` reads in place of a request's headers. */
interface JobContext {
  catalystHeaders: Record<string, string | number>;
  closeWithSuccess(): void;
  closeWithFailure(): void;
}

async function handler(jobRequest: JobRequest, context: JobContext): Promise<void> {
  const catalyst = new Catalyst();
  const execution = new ExecutionContext({ executionId: randomUUID(), catalyst, extras: {} });
  try {
    catalyst.setApp(
      CatalystScope.Admin,
      await zcAuth.init(context as unknown as Parameters<typeof zcAuth.init>[0], {
        scope: CatalystScope.Admin,
      }),
    );
    await runWithContext(execution, () => JobDispatcher.run(jobRequest.getAllJobParams()));
    context.closeWithSuccess();
  } catch (error) {
    logger.error(error);
    context.closeWithFailure();
  }
}

module.exports = handler;
```

- **Every run ends in `closeWithSuccess()` or `closeWithFailure()`.** A run that is never
  closed waits out the 15-minute limit and is then marked failed.
- `eslint.config.mjs` adds `allowCatalystSdk(["src/index.ts", "src/dev-server.ts"])`,
  since both build the Admin app themselves.
- The export, the awaited init and the logger are the same for every function -
  `function-entry-point.md` explains each.

## The dev server

Locally, a job runs from an HTTP call, with no job pool and no deploy. `src/dev-server.ts`
is a small Express app that takes the jobName from the path and the rest of the params
from the body, then calls the same `JobDispatcher.run` as the deployed function:

```ts
// src/dev-server.ts - local only, never imported by index.ts, so never bundled
import express from "express";
import { randomUUID } from "node:crypto";
import { JobExecutorPath } from "@repo/routing/job-executor-path";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { errorHandler, initCatalystScopes, initExecutionContext } from "@repo/http-server/middleware";
import { toRecordResponse } from "@repo/http-server/response";
import { JobDispatcher } from "@/job-dispatcher";

const app = express();
app.use(express.json());
app.post(
  JobExecutorPath.JobExecutor + JobExecutorPath.JobName,
  initExecutionContext,
  initCatalystScopes([CatalystScope.Admin]),
  async (req, res) => {
    const { jobName } = req.params;
    await JobDispatcher.run({ ...req.body, jobName, jobId: randomUUID() });
    res.json(toRecordResponse({ jobName }));
  },
);
app.use(errorHandler);
app.listen(8100);
```

- **Its paths live in `packages/routing/src/<name>-path.ts`**, named after the app, as
  for any app that serves HTTP. That file holds the prefix (`JobExecutor: "/job-executor"`)
  and the parameter (`JobName: "/:jobName"`).
- **It is reached through the proxy.** `apps/proxy` routes the prefix to the dev port, so
  the headers `catalyst serve` injects reach `initCatalystScopes`. Without them the Admin
  app cannot be built.
- `express` is a `devDependency`. The bundle installs `dependencies` only, and
  `dev-server.ts` is never bundled.
- `"dev": "tsx watch --env-file-if-exists=../../.env --env-file-if-exists=.env src/dev-server.ts"`,
  on its own port from 8100 up. `pnpm dev` then starts it with everything else.
- The middleware and response builders are the shared Express plumbing, which comes from
  `@repo/http-server` (`.claude/skills/deployable-steps.md`).

```bash
curl -X POST http://localhost:3001/job-executor/reminder \
  -H 'content-type: application/json' -d '{"todoId":"1"}'
```

The dev server is the local loop - not `catalyst functions:execute`. It proves the job
logic; a real submission still has to be checked after deploying, because it does not
exercise the job pool, the deployed environment or the timing.

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
