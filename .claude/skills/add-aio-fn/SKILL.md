---
name: add-aio-fn
description: Add a Catalyst Advanced I/O function to this repo - an exported Express app with its workspace, catalyst-config.json, bundle, catalyst.json and deploy entries, dev server and proxy route. Use when an HTTP API should deploy apart from apps/api, or when asked to create an Advanced I/O function.
---

# Add an Advanced I/O function

An Advanced I/O function is an Express app built like `apps/api`. It is exported and
never listens. What goes inside it is described in
`.claude/rules/catalyst/advanced-io-function.md`. This skill creates it.

1. **Agree it with the user.** It is a new deployable, so settle these first:
   - its name
   - why it is not a router in `apps/api`
   - whether the browser calls it
2. **Read `.claude/skills/deployable-steps.md` and `.claude/skills/function-steps.md`**,
   then follow them with `--type aio`. If `@repo/http-server` does not exist yet, create
   it first, as described in `deployable-steps.md`. This app imports its middleware,
   errors and response builders.
3. **Write the app**, following `advanced-io-function.md`:
   - `src/app.ts` sets the middleware order of `apps/api`'s `app.ts`.
   - `src/index.ts` is `module.exports = app`.
   - `src/dev-server.ts` is `app.listen(<port>)`, using a port from 8100 up.
   - `src/routes/` holds the routes.
   - `src/env.ts` holds its own keys.
   - `express` is a runtime `dependency`.
4. **Add its paths** in `packages/routing/src/<name>-path.ts`. Then add a proxy route for
   its prefix, and a `dev` script that runs `tsx watch` on `src/dev-server.ts`.
5. **If the browser calls it**, follow "When the browser calls it" in
   `deployable-steps.md`. That covers the build-time URL key, the client pair and
   Authorized Domains.
6. **Guard each route** that needs a signed-in caller with
   `initCatalystScopes([CatalystScope.User])`. Its Security Rule starts at `optional`, so
   the URL is public.
7. **Verify:**
   - Run `pnpm verify`. Its integration tests drive `src/app.ts` through Supertest.
   - Make one request through the URL `pnpm dev` prints.
   - After the first deploy, log `req.url` from a known route once. If it differs from
     the local path, add a `pathRewrite` to the proxy route so the two match.
