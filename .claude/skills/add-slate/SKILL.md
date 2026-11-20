---
name: add-slate
description: Add a second Catalyst Slate app to this repo, shaped like apps/web - workspace, CLI-generated slate-config.toml, bundle, catalyst.json and deploy entries, local proxy prefix, and Console setup. Use when a second frontend on its own domain is needed, or when asked to create a Slate app.
---

# Add a Slate app

1. **Agree it with the user.** It is a new deployable. Settle its name and which backends
   it calls.
2. **Read `.claude/skills/deployable-steps.md`.**
3. **Set up the workspace.** Copy the shape of `apps/web` into `apps/<name>`, leaving
   out its product code. Bring:
   - the root layout, with its `Toaster`
   - `src/execution-context.ts`, `src/server-logging.ts` and `src/env.ts`
   - `src/catalyst/`
   - the shared components it uses
   - `globals.css`

   Its `dev` script runs `next dev -p` on a free port, 4001 and up.
4. **Generate its Slate config** from the repo root. Never hand-write it:

   ```bash
   catalyst slate:link --name <name> --framework nextjs --source apps/<name> --default
   ```

   That writes `apps/<name>/.catalyst/slate-config.toml` and a `slate` entry in
   `catalyst.json`. Change that entry's `source` to `slate/<name>`, because the staged
   copy is what deploys, as for `web`.
5. **Copy the bundle.** `scripts/bundle.mjs` is a copy of `apps/web`'s, with `outDir` set
   to `slate/<name>`. Copy `apps/web/turbo.json` too, so `bundle` depends on `^build`
   alone.
6. **Add it to the deploy.** In the root `package.json`, add `slate:<name>` to the
   `deploy` script's `--only` list.
7. **Set up local routing.** The proxy's catch-all, `webProxy`, belongs to `web`, so this app is served
   under its own prefix:
   - Add a `createProxyMiddleware` for `/<name>` with `ws: true`. Register it before
     `webProxy`, and have `server.on("upgrade")` pick between the two by prefix - today it
     hands every upgrade to `webProxy`.
   - In `next.config.ts`, set `basePath: "/<name>"` **only when `NODE_ENV` is
     `development`**. Slate serves every app from `/`, so a basePath in the deployed
     build would 404 every asset.
   - The first time, confirm that sign-in works under the prefix locally. The web SDK's
     own requests have not been checked there.
8. **Set it up in the Console:**
   - Activate Slate once per project (Console -> Slate -> Start Exploring). Until then a
     deploy fails with HTTP 400.
   - On its own Slate Console page, set every key on its `src/env.ts`.
   - Set its build settings to `npm install` / `npm run build`. `slate-config.toml`
     applies only to the first deployment, and the bundle rewrites only the staged copy.
9. **Verify** with "Before calling it done" in `deployable-steps.md`.
