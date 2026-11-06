# Basic I/O function

A Basic I/O function does one thing: it reads its arguments, does one piece of work, and
writes back one string. It has a single handler and nothing else. There is no routing, no
dispatch, and no switch on an argument that picks between kinds of request. If you need a
second operation, write a second function, or use an Advanced I/O function or an `api`
route if it needs real HTTP.

Creating the workspace, its bundle, `catalyst.json` and the `deploy` flag is covered in
the `add-bio-fn` skill. This file covers what goes inside.

## Layout

```
apps/<name>/
  src/handler.ts        the handler - the one thing this function does
  src/index.ts          `module.exports = handler` - the bundle entry
  src/dev-server.ts     local only - calls the same handler from an Express route
  catalyst-config.json  from `catalyst functions:add --type bio`
```

The handler sits in its own file because two things call it. `index.ts` exports it to
Catalyst, and `dev-server.ts` calls it locally. The dev server cannot import from
`index.ts`: under `module: "ESNext"`, `module.exports = handler` leaves nothing for
TypeScript to import.

If the work takes more than a few lines, put it in a repository or a wrapper method in
node-utils, as a route would. The handler stays short and just calls it.

## The handler

```ts
// src/handler.ts
import { randomUUID } from "node:crypto";
import { zcAuth } from "@zcatalyst/auth";
import { Catalyst } from "@repo/node-utils/catalyst/catalyst";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { ExecutionContext, runWithContext } from "@repo/node-utils/framework/async-context";
import { logger } from "@repo/node-utils/framework/logger";
import { TodoRepository } from "@repo/node-utils/repositories/todo-repository";

/** What Catalyst passes a Basic I/O function - `types/basicio.d.ts` from `functions:add`. */
export interface BasicIo {
  getArgument(key: string): string;
  setStatus(statusCode: number): void;
  write(value: string): void;
}

export interface BasicIoContext {
  catalystHeaders: Record<string, string>;
  close(): void;
}

export async function handler(context: BasicIoContext, basicIo: BasicIo): Promise<void> {
  const todoId = basicIo.getArgument("todoId");
  if (!todoId) {
    basicIo.setStatus(400);
    basicIo.write("todoId is required.");
    context.close();
    return;
  }
  const catalyst = new Catalyst();
  const execution = new ExecutionContext({ executionId: randomUUID(), catalyst, extras: {} });
  try {
    catalyst.setApp(
      CatalystScope.Admin,
      await zcAuth.init(context as unknown as Parameters<typeof zcAuth.init>[0], {
        scope: CatalystScope.Admin,
      }),
    );
    const todo = await runWithContext(execution, () => TodoRepository.find(todoId));
    basicIo.write(JSON.stringify(todo ?? null));
  } catch (error) {
    logger.error(error);
    basicIo.setStatus(500);
    basicIo.write("Something went wrong.");
  }
  context.close();
}
```

```ts
// src/index.ts
import { handler } from "@/handler";

module.exports = handler;
```

- **`getArgument(key)` reads the query string first and the JSON body second.** Every
  value comes back as a string.
- **`write` takes one string, once.** Serialize an object yourself. A value that is not a
  string throws.
- **Call `context.close()` on every path**, including the early return after validation.
  A run that is never closed holds the caller until it times out.
- **Use Admin scope.** No one has checked yet whether a Basic I/O context can build a
  User app. Check that before a function relies on knowing who called it.
- The export, the awaited init and the logger are the same for every function, and
  `function-entry-point.md` explains each one. `eslint.config.mjs` adds
  `allowCatalystSdk(["src/handler.ts"])`.

## The dev server

Locally, the real handler runs behind an Express route. The dev server turns the request
into the `BasicIo` and context objects Catalyst would pass, and turns `write` and
`close` back into the response:

```ts
// src/dev-server.ts - local only, never imported by index.ts, so never bundled
import express from "express";
import { TodoLookupPath } from "@repo/routing/todo-lookup-path";
import { handler, type BasicIo, type BasicIoContext } from "@/handler";

const app = express();
app.get(TodoLookupPath.TodoLookup, async (req, res) => {
  let output = "";
  const basicIo: BasicIo = {
    getArgument: (key) => {
      const value = req.query[key];
      return typeof value === "string" ? value : "";
    },
    setStatus: (statusCode) => {
      res.status(statusCode);
    },
    write: (value) => {
      output = value;
    },
  };
  // zcAuth.init reads `catalystHeaders` exactly as it reads a request's `headers`, so the
  // headers `catalyst serve` injects initialize the handler as they do when deployed.
  const context: BasicIoContext = {
    catalystHeaders: req.headers as Record<string, string>,
    close: () => {
      res.send(output);
    },
  };
  await handler(context, basicIo);
});
app.listen(8100);
```

- **Its path lives in `packages/routing/src/<name>-path.ts`.** The proxy routes that path
  to the dev port, so the request carries the Catalyst headers. Called directly, the init
  fails with `app/invalid_project_details`.
- **It needs no `@repo/http-server`.** The handler builds its own execution context, as
  it does when deployed.
- **`express` is a `devDependency`.** The `dev` script runs `tsx watch` on
  `src/dev-server.ts`, on a port from 8100 up.

## Who can call it

Security Rules start at `optional`, so a Basic I/O function's URL is public. Any function
that reads or changes data people should not see must have its Security Rule set to
`required`. The deployed URL is `https://<project-domain>/server/<name>/execute`, and
the `/execute` suffix is required. The URL printed after a deploy leaves it off.

## Limits

30 seconds per run.
