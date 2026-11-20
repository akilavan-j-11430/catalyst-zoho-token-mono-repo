---
paths:
  - "apps/*/src/job-dispatcher.ts"
  - "apps/*/src/jobs/**"
---

# Where code goes in a Job function

The entry point and the dispatcher are wiring (`job-function.md`). This rule says where a
job's work goes and when it moves. The moves are the ones a Node API makes
(`node-api/code-placement.md`), so an area has one name wherever it lives.

## Where it starts

| You need | It starts in |
|---|---|
| a job | a class in `src/jobs/<job-name>.ts` with a `static async run(params)`, and one line in the dispatcher |
| its params checked | a zod schema in the job's file, through `InputValidation.parse` |
| the work | the job's `run` itself |
| data | a repository in `@repo/repositories`, or a bucket, cache or job handle, in Admin scope |

Unlike a route, a job holds its own work. It has no transport to keep apart from the
business, and its class is already named for the operation. A `run` that passes 30 lines
splits into `private static` members of the same class.

## The params

Catalyst hands every param over as a string (`JobParams`), and the dispatcher checks only
`jobName`. The job parses the rest first:

```ts
// src/jobs/reminder.ts
const reminderParams = z.object({
  todoId: z.string({ error: "is required." }).min(1, "is required."),
});

/** Sends the reminder for one todo. */
export class ReminderJob {
  static async run(params: JobParams): Promise<void> {
    const { todoId } = InputValidation.parse(reminderParams, params);
    // repositories and handles, called as a route calls them
  }
}
```

- A param that fails throws `InvalidInputError` naming the field, and the run closes as
  failed, so a bad submission shows in the job's history.
- A number or a date arrives as a string. Convert it in the schema - `z.coerce.number()`.
- The workspace takes `zod` and `@repo/input-validation` as dependencies.

## When it moves

| When | Move it to |
|---|---|
| a second job in this function needs the same work | `src/<area>/<areas>.ts` - class `Reminders` - called by both jobs |
| a route, a Server Action or another function needs it | a package, `packages/<area>` (`@repo/reminders`), that both import. Nothing imports from an app |

An area follows "An area" in `node-api/code-placement.md`.
