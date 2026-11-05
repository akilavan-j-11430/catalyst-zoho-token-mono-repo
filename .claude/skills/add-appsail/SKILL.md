---
name: add-appsail
description: Add a new Catalyst AppSail to this repo, shaped like apps/api - workspace, app-config.json, bundle, catalyst.json and deploy entries, proxy route, and the browser wiring when the web app calls it. Use when a process must outlive 15 minutes, hold WebSockets or keep state between requests, or when asked to create an AppSail.
---

# Add an AppSail

1. **Agree it with the user.** It is a new deployable, so settle three things first: its
   name, why it is not a function or an `apps/api` router, and whether the browser calls
   it.
2. **Read `.claude/skills/deployable-steps.md`.** If `@repo/http-server` does not exist
   yet, create it first, as that file describes. The second AppSail also moves
   `catalyst-logger.ts` into `node-utils`.
3. **Copy the shape of `apps/api` into `apps/<name>`.** Import the plumbing from
   `@repo/http-server` rather than copying it. Then:
   - `package.json`: the app's name, and the same `build`, `bundle`, `dev`, `typecheck`,
     `lint` and `test:*` scripts as `apps/api`.
   - `src/index.ts`: listen on `X_ZOHO_CATALYST_LISTEN_PORT`, then `PORT`, then a free
     local port from 8001 up.
   - `app-config.json`: `command`, `build_path: "./"`, `stack: "node24"`, and `memory`
     (256-2048).
     - Leave out `env_variables`. Values never live in a Catalyst file
       (`environment.md`).
     - Leave out `catalyst_auth`. A route that needs a signed-in caller mounts
       `initCatalystScopes([CatalystScope.User])` instead.
   - `scripts/bundle.mjs`: a copy of `apps/api`'s, with `outDir` set to
     `appsails/<name>`.
   - `src/env.ts`, `turbo.json` (`dev` `passThroughEnv`) and `.env.example` for its own
     keys, in the four steps `environment.md` lists. Two AppSails never share a key list.
4. **Outside the workspace:**
   - `catalyst.json`: add `{ "source": "appsails/<name>", "name": "<name>" }` under
     `appsail`.
   - Root `package.json`: add `appsail:<name>` to the `deploy` script's `--only` list.
   - Add its paths in `packages/routing/src/<name>-path.ts`, and a proxy route for its
     prefix, as `deployable-steps.md` describes.
5. **If the browser calls it**, follow "When the browser calls it" in
   `deployable-steps.md`.
6. **In the Console**, set its environment variables under
   **AppSail -> <name> -> Configuration** before the first deploy that needs them.
7. **Verify** with "Before calling it done" in `deployable-steps.md`.
