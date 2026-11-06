---
name: add-job-fn
description: Add a Catalyst Job function to this repo - the workspace, catalyst-config.json, bundle, catalyst.json and deploy entries, the jobName dispatcher and the local dev server. Use when a Job handle needs a function to run it, or when asked to create a job function.
---

# Add a Job function

One Job function runs every job that names it as `jobTargetFunctionName`. What goes
inside it is described in `.claude/rules/catalyst/job-function.md`. This skill creates it.

1. **Agree it with the user.** It is a new deployable. Settle its name, which is often
   `job-executor`, and the first job it runs.
2. **Read `.claude/skills/deployable-steps.md` and `.claude/skills/function-steps.md`**
   and follow them with `--type job`.
3. **Write the function** following `job-function.md`:
   - `src/index.ts` - the entry point, ending in `module.exports = handler`
   - `src/job-dispatcher.ts` - reads `jobName`, which is required, and the optional
     `jobId`, and throws on a missing or unknown `jobName`
   - one class per job in `src/jobs/<job-name>.ts`
   - `src/dev-server.ts`
4. **Point each job at it.** In `packages/node-utils/src/catalyst/resources.ts`, each
   `Job.create` sets `jobTargetFunctionName: "<name>"`. Each job also gets one line in the
   dispatcher's `jobs` map, keyed by its handle's `config.jobName`.
5. **Set up the dev server:**
   - Add `packages/routing/src/<name>-path.ts` with the prefix and `JobName: "/:jobName"`.
   - Add a proxy route for the prefix.
   - Add `express` as a `devDependency`.
   - Add a `dev` script that runs `tsx watch` on `src/dev-server.ts`, on a port from 8100
     up.
6. **In the Console**, the job pool exists with type Function, and the function's memory
   is no more than the pool's. If it is more, every submission is rejected with
   `INVALID_INPUT`.
7. **Verify:**
   - Run `pnpm verify`.
   - With `pnpm dev` running, send
     `curl -X POST <printed URL>/<prefix>/<jobName> -H 'content-type: application/json' -d '<params>'`
     and confirm the job ran.
   - After deploying, submit one real job through its handle and check the job's history
     in the Console.
