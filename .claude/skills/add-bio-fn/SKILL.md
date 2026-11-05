---
name: add-bio-fn
description: Add a Catalyst Basic I/O function to this repo - a single handler with its workspace, catalyst-config.json, bundle, catalyst.json and deploy entries, and a local dev server that calls the same handler. Use when one small operation should be callable as its own function, or when asked to create a Basic I/O function.
---

# Add a Basic I/O function

A Basic I/O function is one handler: it reads its arguments, does one piece of work, and
writes back one string. What goes inside it is described in
`.claude/rules/catalyst/basic-io-function.md`. This skill creates it.

1. **Agree it with the user.** It is a new deployable, so settle its name, its arguments
   and what it writes back. If it needs more than one operation, use an `apps/api` route
   or an Advanced I/O function instead.
2. **Read `.claude/skills/deployable-steps.md` and `.claude/skills/function-steps.md`**,
   then follow them with `--type bio`.
3. **Write the function**, following `basic-io-function.md`:
   - `src/handler.ts` holds the handler. It validates the arguments first, does the work
     through node-utils, calls `write` once, and calls `context.close()` on every path.
   - `src/index.ts` is `module.exports = handler`.
   - `src/dev-server.ts` calls the same handler from an Express route.
4. **Set up the dev server:**
   - Add `packages/routing/src/<name>-path.ts` with the prefix.
   - Add a proxy route for that prefix.
   - Add `express` as a `devDependency`.
   - Add a `dev` script that runs `tsx watch` on `src/dev-server.ts`, on a port from 8100
     up.
5. **Set its Security Rule** to `required` if it reads or changes data that not everyone
   may see. The default, `optional`, makes the URL public.
6. **Verify:**
   - Run `pnpm verify`.
   - With `pnpm dev` running, call `<printed URL>/<prefix>?<argument>=<value>` and check
     what it writes back.
   - After deploying, call `https://<project-domain>/server/<name>/execute`. The deploy
     output leaves off the `/execute` suffix, but the URL needs it.
