# Steps every function shares

Every `add-*-fn` skill reads this file, after `deployable-steps.md` and before its own
steps. What goes inside the function is in that kind's rule - `.claude/rules/node-job/` for a
Job function, `.claude/rules/node-event/` for a Signal function, `.claude/rules/catalyst/`
for Basic I/O and Advanced I/O - and every entry point follows
`.claude/rules/catalyst/function-entry-point.md`.

1. **Generate its config once.** From the repo root:

   ```bash
   catalyst functions:add --name <name> --type <job|event|aio|bio> --stack node24 -ni < /dev/null
   ```

   This writes `functions/<name>/` and adds the `functions` block to `catalyst.json`:

   ```json
   "functions": { "targets": ["<name>"], "ignore": [], "source": "functions" }
   ```

   Then:
   - Keep that `catalyst.json` block. A second function adds its name to `targets`.
   - Move `functions/<name>/catalyst-config.json` into `apps/<name>/`.
   - Read the generated `index.js` and `types/`, then delete the rest of the scaffold,
     `catalyst-inputs.json` included.
   - Never hand-write `catalyst-config.json`, because its `deployment.type` is what
     Catalyst invokes the function as.
   - Delete the `env_variables` key the CLI writes into it. Catalyst keeps each function's
     environment variables against the resource in the Console, so this repo does not
     maintain them.
2. **The workspace** is set up as "Build and bundle" in `node-api/express-app.md` says:
   CommonJS, the `tsconfig.json` / `tsconfig.build.json` pair, and `@types/node`. Its
   dependencies are `@repo/async-context`, `@repo/logger`, `@repo/catalyst-node`,
   `@repo/repositories` once it reads a record, the `@zcatalyst/*` packages its wrappers
   need, and `pino` - the logger's runtime dependency, which the bundle installs rather than
   inlines. The function sets its apps through
   `CatalystSession.setApp` rather than building them itself, so it needs no
   `allowCatalystSdk([...])`.
3. **`scripts/bundle.mjs`** is written as "Build and bundle" in `node-api/express-app.md`
   describes, from a copy of `apps/proxy/scripts/bundle.mjs`, with these changes:
   - `outDir` is `functions/<name>`.
   - It copies `catalyst-config.json` instead of `app-config.json`.
   - The entry is `src/index.ts` alone, so `src/dev-server.ts` is never bundled.
   - It keeps `npm install --omit=dev`. Never add `--silent`: it hides a version that does
     not resolve, which then fails at runtime as `MODULE_NOT_FOUND`.
4. **Root `package.json`**: add `functions:<name>` to the `deploy` script's `--only` list.

**Running it locally:** every kind has a `src/dev-server.ts`, which `pnpm dev` starts on a
port from 8100 up through the `dev` script
(`tsx watch --env-file-if-exists=.env src/dev-server.ts`). Turbo starts it, not
`catalyst serve`, so it gets none of the Catalyst SDK's own keys: copy their block from
`apps/web/.env.example` into the function's own `.env.example` (`environment.md`, "The keys
the Catalyst SDK reads"). The proxy routes the function's prefix to that port, so a local call goes through the URL
`pnpm dev` prints and carries the headers `catalyst serve` injects. Do not run functions
with `catalyst functions:execute` or `catalyst serve --only functions` - the dev server is
the local loop. It never reaches the bundle: nothing imports it from `src/index.ts`.

The dev server proves the code, not the deployed configuration, so make one real call
after deploying.
