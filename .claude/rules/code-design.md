# Code design

Two rules for every workspace: behaviour lives in classes, and a class or a system design
follows a pattern that already has a name.

## Classes over functions

A module exports a class named for its domain role, or the types and constants that class
uses. Not a loose set of exported functions.

- **A stateless service is a class with static members.** Its constants, caches and helpers
  are `private static` members referenced through the class name, never module-level
  `const`s or functions beside it.
- **Something that holds state per use is an instance class**, with a `private` constructor
  and a `static create(...)` when construction must stay in one place.
- **A single-caller helper is still a member**, not a free function next to the class. If it
  is only a few lines, inline it instead.

Exceptions, where the framework dictates the shape:

- React components and hooks
- Express route handlers and middleware
- entry points and bundle scripts
- callbacks a vendor API requires
- the Catalyst wrappers' module-private SDK accessors, which `catalyst-sdk.md` prescribes

## Name the pattern

Before inventing a shape, use the established pattern that fits - Repository, Adapter,
Facade, Strategy, Factory, Observer, Singleton - and say which one in the class's doc
comment.

A system design names its patterns the same way - publish/subscribe, cache-aside,
write-through, idempotent consumer, backpressure, retry with backoff - and states in those
terms how it handles consistency, failure and recovery. `docs/architecture.md` is where
that goes.

## A pattern still has to earn its place

A pattern picks between shapes the code needs today. It is never a reason to add a layer.
An interface with one implementation and no second in sight, a factory for a class built in
one place, or a strategy with one strategy is the hypothetical-future abstraction the
root instructions rule out. The pattern arrives with its second case, and the second case
says what the shape should be.

## No callback parameters in server code

In `apps/api` and `packages/node-utils`, a method does its work in its own body. Do not
write a helper that takes a callback (`cb`, `fn`, `call: () => Promise<T>`) just to wrap
`try/catch`, logging or a cast around it - write the `try/catch` inline in each method, as
`bucket.ts` does. A helper takes values and returns values.

```ts
// not this
insertRow(row: Row): Promise<StoredRow<Row>> {
  return this.run("insertRow", () => this.table().insertRow(row));
}

// this
async insertRow(row: Row): Promise<StoredRow<Row>> {
  try {
    const storedRow = await this.table().insertRow(row);
    return storedRow as unknown as StoredRow<Row>;
  } catch (cause) {
    throw CatalystError.InvalidResource(`insertRow failed on ${this.name}`, cause);
  }
}
```

The exception is an API that itself takes a callback - `AsyncLocalStorage.run`, Express
middleware, `Array.map`/`filter` - and `PLimit`/`PLimitPerKey` (`node-utils/src/utils/`),
whose whole job is to decide when a task runs. The per-user lock in `ZohoConnection` is
that case, not a wrapper to inline.

Events follow the same split. Consuming a Node event is allowed, but prefer the awaitable
form where Node has one:

| Instead of | Write |
|---|---|
| `stream.on("data", ...)` / `on("end", ...)` | `for await (const chunk of stream)`, as `bucket.ts` does |
| `source.pipe(target)` plus `on("error", ...)` | `await pipeline(source, target)` from `node:stream/promises` |
| waiting on `stream.on("finish")` / `on("close")` | `await finished(stream)` from `node:stream/promises` |
| a one-shot event you wait for | `await once(emitter, "ready")` from `node:events` |

Keep a listener only when the code must not wait for the event - logging after a response,
cleanup on a client disconnect, a handler that fires many times. `res.on("finish")` in
`apps/api/src/middleware.ts` and `server.on("upgrade")` in `apps/proxy/src/index.ts` are
that case.

Keep the implementation simple and name each variable for what it holds - `storedRow`,
`queryResult`, `page` - never `cb`, `fn`, `tmp` or `x`.

This is server-side only. React components and hooks are callback-driven by design.
