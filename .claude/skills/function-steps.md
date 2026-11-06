# Steps every function shares

Every `add-*-fn` skill reads this file, after `deployable-steps.md` and before its own
steps. What goes inside the function is in that kind's rule under
`.claude/rules/catalyst/`, and every entry point follows
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
2. **The workspace** is set up like `apps/api`: CommonJS, the same `tsconfig.json` /
   `tsconfig.build.json` pair, and `@types/node`. Its dependencies are `@repo/node-utils`
   and the `@zcatalyst/*` packages its wrappers need. In `eslint.config.mjs`, list each
   file that builds the Catalyst app itself in `allowCatalystSdk([...])`.
3. **`scripts/bundle.mjs`** is a copy of `apps/api`'s, with these changes:
   - `outDir` is `functions/<name>`.
   - It copies `catalyst-config.json` instead of `app-config.json`.
   - The entry is `src/index.ts` alone, so `src/dev-server.ts` is never bundled.
   - It keeps `npm install --omit=dev`. Never add `--silent`: it hides a version that does
     not resolve, which then fails at runtime as `MODULE_NOT_FOUND`.
4. **Root `package.json`**: add `functions:<name>` to the `deploy` script's `--only` list.

**Running it locally:** every kind has a `src/dev-server.ts`, which `pnpm dev` starts on a
port from 8100 up through the `dev` script
(`tsx watch --env-file-if-exists=../../.env --env-file-if-exists=.env src/dev-server.ts`).
The proxy routes the function's prefix to that port, so a local call goes through the URL
`pnpm dev` prints and carries the headers `catalyst serve` injects. Do not run functions
with `catalyst functions:execute` or `catalyst serve --only functions` - the dev server is
the local loop. It never reaches the bundle: nothing imports it from `src/index.ts`.

The dev server proves the code, not the deployed configuration, so make one real call
after deploying.
