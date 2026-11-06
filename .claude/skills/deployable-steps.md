# Steps every deployable shares

Every `add-*` skill reads this file before its own steps. It covers the parts that are the
same for any AppSail, function or Slate app.

A new deployable changes the deploy surface, so the user agrees to it before anything is
built (root `CLAUDE.md`).

## The chain

Every deployable follows the same chain. Its source lives in a workspace, and
`scripts/bundle.mjs` stages a copy ready to deploy in a gitignored folder at the repo
root. `catalyst.json` points Catalyst at that folder, and the root `deploy` script names
it.

| | AppSail | Function | Slate app |
|---|---|---|---|
| Workspace | `apps/<name>` | `apps/<name>` | `apps/<name>` |
| Staged by `scripts/bundle.mjs` into | `appsails/<name>/` | `functions/<name>/` | `slate/<name>/` |
| Catalyst config, kept in the workspace and copied by the bundle | `app-config.json` | `catalyst-config.json` | `.catalyst/slate-config.toml`, CLI-generated |
| `catalyst.json` | an `appsail` entry, `source: "appsails/<name>"` | `<name>` in `functions.targets` | a `slate` entry, `source: "slate/<name>"` |
| Root `deploy` script | `--only ...,appsail:<name>` | `--only ...,functions:<name>` | `--only ...,slate:<name>` |

- **Use one name everywhere.** The workspace folder, the `package.json` name, the staged
  folder, the `catalyst.json` entry and the `--only` flag are all the same kebab-case
  string. The CLI accepts a hyphenated function name (`functions:add --name job-executor`).
- **Never edit the staged folder.** Every bundle wipes and rebuilds it, so change the
  workspace instead.
- **The bundle reads the workspace's `package.json`.** It strips every `@repo/*`
  dependency, which esbuild inlines, and installs the rest. A runtime dependency missing
  from that file is missing in the cloud.
- **Its paths**, if it serves HTTP or has a dev server, go in
  `packages/routing/src/<name>-path.ts`, named after the app as `api-path.ts` is for
  `api`. The first segment is the app's own prefix, never `/api`, which belongs to
  `apps/api`. In `apps/proxy/src/index.ts`, register a `createProxyMiddleware` for that
  prefix and port **before** the catch-all to `web`. If the app serves WebSockets, add the
  prefix to the `server.on("upgrade")` dispatch as well. This is the one change to
  `apps/proxy` a deployable makes, and it is what carries the headers `catalyst serve`
  injects through to the new app.
- **Local ports:** `api` uses 8000, `web` 4000 and `proxy` 4600. A new AppSail takes 8001
  and up, a function's dev server 8100 and up, and a Slate app 4001 and up.
- **Every new deployable gets** a `CLAUDE.md` in its workspace, a row in the root
  `CLAUDE.md` workspace table, and a line in the README architecture when the local
  routing changes.

## When the browser calls it

An AppSail or an Advanced I/O function is its own origin in the cloud, so `apps/web`
needs to be told where it is:

- Add `NEXT_PUBLIC_<NAME>_URL` to `apps/web/.env.example`. Set it in **Console -> Slate
  -> web -> Environment Variables**, and leave it unset locally (`environment.md`).
- In `apps/web/src/services/api/client.ts`, build a base URL from that literal plus the
  app's prefix. Add a pair of clients beside `api` / `publicApi`: `billingApi` with
  `AuthClient.authHeaders()`, and `billingPublicApi` without. Locally the key is unset, so
  calls stay relative and go through the proxy route.
- The bearer token is the same one `api` receives. A route guarded with
  `initCatalystScopes([CatalystScope.User])` answers 401 without it, exactly as in `api`.
- CORS comes from Authorized Domains, which already lists the Slate domain for `api`.
  Confirm that the first browser call to the new origin succeeds. Never add CORS
  middleware: it duplicates the header, and the browser then rejects both.

## The shared Express plumbing: `@repo/http-server`

`packages/http-server` holds the Express plumbing every app that serves HTTP shares - a
second AppSail, an Advanced I/O function, the dev server of a job or Signal function:

- `@repo/http-server/middleware` - `initExecutionContext`, `initCatalystScopes`,
  `recordRequestTiming`, `errorHandler`
- `@repo/http-server/http-error` - `HttpError`
- `@repo/http-server/response` - the response builders
- `@repo/http-server/request-input` - `RequestInput.parse(schema, input)`, which checks a
  body, query or params against a zod schema and answers 400 naming the field

Import it; never copy it. It is the one package allowed to import `express`
(`packages/CLAUDE.md`). esbuild inlines it like every `@repo/*` package, but `express`
stays external, so every app that runs it in the cloud lists `express` in its own
`dependencies`.

`apps/api/src/framework/catalyst-logger.ts` is specific to AppSail, not to Express. The
second AppSail moves it into `node-utils`' `framework/`.

## Before calling it done

- Run `pnpm verify`.
- Run `pnpm bundle`, then check the staged folder:
  - An AppSail has `index.js`, `package.json`, `app-config.json` and `node_modules/`.
  - A function has `catalyst-config.json` beside those.
  - A Slate app has `vendor/` and a `package-lock.json`.
- Make one real request through the URL `pnpm dev` prints - to the app, or to the
  function's dev server.
- After `pnpm deploy`, check the deployment in the Console. A Slate deploy can report
  success in the CLI even though the build failed on the server.
