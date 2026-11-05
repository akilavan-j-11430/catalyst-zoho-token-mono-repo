---
name: add-signal-fn
description: Add a Catalyst Signal (Event) function to this repo - the workspace, catalyst-config.json, bundle, catalyst.json and deploy entries, the event-name dispatcher and the local dev server. Use when a Catalyst Signals rule needs a function to deliver to, or when asked to create a signal or event function.
---

# Add a Signal function

One Signal function handles every event a Signals rule delivers to it. It routes each
event to a handler by the event's `api_name`. What goes inside it is described in
`.claude/rules/catalyst/signal-function.md`; this skill creates it.

1. **Agree it with the user.** It is a new deployable. Settle its name, the publisher, and
   the events it handles first.
2. **Read `.claude/skills/deployable-steps.md` and `.claude/skills/function-steps.md`**,
   and follow them with `--type event`. If `@repo/http-server` does not exist yet, create
   it first, as `deployable-steps.md` describes, because the dev server imports it.
3. **Write the function, following `signal-function.md`:**
   - `src/index.ts` converts the delivery to camelCase. List it in
     `allowVendorNames(["src/index.ts"])`, and add `@repo/case-conversion` as a dependency.
   - `src/signal-dispatcher.ts` throws on a missing or unknown event name.
   - Each event gets one class in `src/signals/<event-name>.ts`, holding its `apiName`.
   - `src/dev-server.ts` serves the local route.
4. **Set up the dev server:**
   - Add `packages/routing/src/<name>-path.ts` with the prefix and
     `EventName: "/:eventName"`.
   - Add a proxy route for the prefix.
   - Add `express` as a `devDependency`.
   - Add a `dev` script that runs `tsx watch` on `src/dev-server.ts`, on a port from 8100
     up.
5. **In the Console**, create the Signals rule with this function as its target, and give
   it a retry policy. Signals is configured only in the Console. A retry delivers an event
   again, so every handler must be safe to run twice.
6. **Verify:**
   - Run `pnpm verify`.
   - With `pnpm dev` running, send
     `curl -X POST <printed URL>/<prefix>/<api_name> -H 'content-type: application/json' -d '<data>'`.
   - After deploying, publish one real event and check that it reached the handler. That
     covers the delivery envelope and camelCase conversion the dev server skips.
