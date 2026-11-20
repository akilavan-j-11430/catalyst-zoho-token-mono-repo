---
paths:
  - "apps/*/src/signal-dispatcher.ts"
  - "apps/*/src/signals/**"
---

# Signal function

A Signal function is an Event function that a Catalyst Signals rule targets. It follows
the same shape as a job function (`node-job/job-function.md`): one function serves many events.
Each event is sent to its own handler by the event's name, and an event no handler claims
is an error.

Creating the workspace, its bundle, `catalyst.json` and the `deploy` flag is covered in
the `add-signal-fn` skill. This file covers the function's wiring; where an event's work goes
and how it checks its data is `code-placement.md`.

## Layout

```
apps/<name>/
  src/index.ts                the function - `module.exports = handler`, the only bundle entry
  src/signal-dispatcher.ts    SignalDispatcher - picks the handler for each event and runs it
  src/signals/<event-name>.ts one class per event, named after its event name
  src/<area>/<areas>.ts       work two handlers share - `code-placement.md`
  src/dev-server.ts           local only - POST /:eventName runs the dispatcher
  src/<name>-path.ts          the dev server's path segments - `general/routing.md`
  catalyst-config.json        from `catalyst functions:add --type event`
```

## The payload

`event.getRawData()` returns the Signals delivery, in Catalyst's snake_case:

```json
{
  "rule_id": "...",
  "events": [
    {
      "id": "...",
      "source": "publisher_id:.../service:cloudscalecache/...",
      "event_config": { "api_name": "cache_item_created", "id": "..." },
      "data": { "cache_name": "...", "segment_details": { "segment_name": "Default" } }
    }
  ]
}
```

- **`events` is an array.** One delivery can carry several events, and each one is
  dispatched separately.
- **`event_config.api_name` is the event's name.** It decides which handler runs.
- **`data` is the event itself.** The publisher decides its shape.
- **It is converted to camelCase at the entry point**, using `CamelCase.convertKeys`
  (`readable-code.md`). No handler ever sees `api_name` or `cache_name`. The interface
  describing the wire shape keeps Catalyst's casing, so `eslint.config.mjs` names the
  file in `allowVendorNames(["src/index.ts"])`.

## The dispatcher

```ts
// src/signal-dispatcher.ts
import { Logger } from "@repo/logger/logger";
import { CacheItemCreatedSignal } from "@/signals/cache-item-created";

/** One event of a delivery, after camelCase conversion. */
export interface SignalEvent {
  /** The same on every delivery of this event, so a retry can be told apart. */
  eventId: string;
  apiName: string;
  data: Record<string, unknown>;
}

/** Strategy: runs the handler an event's name selects. */
export class SignalDispatcher {
  private static readonly logger = Logger.for("signal-dispatcher");
  private static readonly handlers: Record<
    string,
    (data: Record<string, unknown>, eventId: string) => Promise<void>
  > = {
    [CacheItemCreatedSignal.apiName]: CacheItemCreatedSignal.run,
  };

  static async run(signalEvent: SignalEvent): Promise<void> {
    const { eventId, apiName, data } = signalEvent;
    if (!apiName) {
      throw new Error("Signal event carries no api_name.");
    }
    const handle = SignalDispatcher.handlers[apiName];
    if (!handle) {
      throw new Error(`No handler is registered for event "${apiName}".`);
    }
    SignalDispatcher.logger.info(`Handling event ${apiName} (${eventId})`);
    await handle(data, eventId);
  }
}
```

Each handler is a class with a `static readonly apiName` and a `static async run(data,
eventId)`.
The class holds the event name, so the dispatcher never writes it as a string literal:

```ts
// src/signals/cache-item-created.ts
export class CacheItemCreatedSignal {
  static readonly apiName = "cache_item_created";

  static async run(data: Record<string, unknown>, eventId: string): Promise<void> {
    // parse `data` with this event's schema, then call repositories and handles
  }
}
```

- **Parse `data` first**, with a zod schema naming the fields the handler reads
  (`code-placement.md`). It is whatever the publisher sent.
- **Admin is the only scope.** An event has no signed-in user, so the entry point sets only
  the Admin app.
- **A handler must be safe to run twice** (idempotent consumer). Signals retries a failed
  delivery under the rule's retry policy, so a handler can see the same event again.
  When the work cannot simply be done twice, record `eventId` with it and skip an event
  already recorded.

## The entry point

The entry point follows `node-job/job-function.md` and differs in three places:

```ts
// src/index.ts - the parts that differ from the job entry point
interface SignalsDelivery {
  events: { id: string; event_config: { api_name: string }; data: Record<string, unknown> }[];
}

interface SignalsEvent {
  getRawData(): Record<string, unknown>;
}

// inside handler(event: SignalsEvent, context), after the execution context is built:
const { events } = CamelCase.convertKeys(event.getRawData() as unknown as SignalsDelivery);
await runWithContext(execution, async () => {
  await CatalystSession.setApp(context.catalystHeaders, CatalystScope.Admin);
  // One at a time, so a failure names the event that caused it.
  for (const signalEvent of events) {
    await SignalDispatcher.run({
      eventId: signalEvent.id,
      apiName: signalEvent.eventConfig.apiName,
      data: signalEvent.data,
    });
  }
});
await CatalystLogOutput.flush();
context.closeWithSuccess();
```

As in the job function, the logger is configured at the top of the file, any throw lands in
`closeWithFailure()`, every run closes one way or the other, and the logger is flushed
before either close.

## The dev server

The dev server works exactly like the job function's. `src/dev-server.ts` takes the
event name from the path and the event's `data` from the body, then calls
`SignalDispatcher.run`:

```ts
app.post(SyncPath.Sync + SyncPath.EventName, async (req, res) => {
  const execution = new ExecutionContext({ executionId: randomUUID(), extras: {} });
  await runWithContext(execution, async () => {
    await CatalystSession.setApp(req.headers, CatalystScope.Admin);
    await SignalDispatcher.run({
      eventId: randomUUID(),
      apiName: req.params.eventName,
      data: req.body,
    });
  });
  res.json({ eventName: req.params.eventName });
});
```

The body is the event's `data` in camelCase, exactly as a handler receives it, and each
call gets a new `eventId`. Its
execution context, its path file (`SyncPath` from `@/sync-path`), proxy route, port,
`devDependency` on `express` and `dev` script all follow `node-job/job-function.md`.

The dev server is the local loop - not `catalyst functions:execute`. It skips the
delivery envelope and the camelCase conversion in `index.ts`, so check those with one real
event after deploying. `catalyst signals:generate <publisher_service> <event_name>` prints
a real payload, to see the shape a handler's `data` will have.

## Limits

15 minutes per run.

## Tests

Following `testing.md`, test `SignalDispatcher.run` and each handler's `run` directly:
- an unknown event name throws
- each handler narrows its `data`
- each handler calls the repositories it should, which are faked
