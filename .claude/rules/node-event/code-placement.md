---
paths:
  - "apps/*/src/signal-dispatcher.ts"
  - "apps/*/src/signals/**"
---

# Where code goes in a Signal function

The entry point and the dispatcher are wiring (`signal-function.md`). This rule says where an
event's work goes and when it moves. The moves are the ones a Node API makes
(`node-api/code-placement.md`), so an area has one name wherever it lives.

## Where it starts

| You need | It starts in |
|---|---|
| an event handled | a class in `src/signals/<event-name>.ts` with its `static readonly apiName` and a `static async run(data, eventId)`, and one line in the dispatcher |
| its data checked | a zod schema in the handler's file, through `InputValidation.parse` |
| the work | the handler's `run` itself |
| data | a repository in `@repo/repositories`, or a bucket, cache or job handle, in Admin scope |

Unlike a route, a handler holds its own work. It has no transport to keep apart from the
business, and its class is already named for the event. A `run` that passes 30 lines splits
into `private static` members of the same class.

## The data

An event's `data` is whatever its publisher sends, already in camelCase. The handler parses
the fields it reads first:

```ts
// src/signals/cache-item-created.ts
const cacheItemCreatedData = z.object({
  cacheName: z.string({ error: "is required." }),
  segmentDetails: z.object({ segmentName: z.string({ error: "is required." }) }),
});

export class CacheItemCreatedSignal {
  static readonly apiName = "cache_item_created";

  static async run(data: Record<string, unknown>, eventId: string): Promise<void> {
    const { cacheName, segmentDetails } = InputValidation.parse(cacheItemCreatedData, data);
    // repositories and handles, called as a route calls them
  }
}
```

- Data that fails throws `InvalidInputError` naming the field, and the delivery fails, so
  Signals retries it under the rule's retry policy.
- The schema names only the fields the handler reads. zod drops the rest, so a publisher
  adding a field breaks nothing.
- The workspace takes `zod` and `@repo/input-validation` as dependencies.

## When it moves

| When | Move it to |
|---|---|
| a second event in this function needs the same work | `src/<area>/<areas>.ts`, called by both handlers |
| a route, a Server Action, a job or another function needs it | a package, `packages/<area>`, that both import. Nothing imports from an app |

An area follows "An area" in `node-api/code-placement.md`.
