# catalyst-zoho-token-mono-repo

A monorepo starter kit for building customer solutions on
[Zoho Catalyst](https://catalyst.zoho.com). Clone it, point it at your own Catalyst
project with `catalyst init`, and you have a running full-stack application in a few
minutes.

**What you get out of the box**

- A **Next.js 16** frontend (React 19, Tailwind 4) deployed as a Catalyst Slate app.
- An **Express 5** API on the modular `@zcatalyst/*` SDKs, deployed as a Catalyst AppSail, with
  per-request execution context, structured logging, and a consistent response shape.
- A **reverse proxy** AppSail that gives the whole stack a single origin and enforces
  Catalyst login at the edge.
- **Shared TypeScript packages** for response types, runtime utilities, and a common
  tsconfig - wired up with pnpm workspaces.
- A **Turborepo pipeline** so builds are cached and ordered correctly, plus one-command
  bundle and deploy.

It is deliberately small. There is no database layer, no auth UI, and no example CRUD
resource - just the plumbing that every Catalyst solution ends up needing, done once
and done consistently.

---

## Architecture

```
                         browser
                            |
                            v
              +-----------------------------+
              |  catalyst serve             |   entry point, CLI-assigned port
              |  (3000, 3001, 3002, ...)    |   -> read the URL it prints
              +-----------------------------+
                            |
                            v
              +-----------------------------+
              |  :4600   proxy  (local only)|   catalyst_auth: true
              +-----------------------------+
                     |                  |
          /api/*     |                  |    /*
                     v                  v
        +---------------------+   +----------------------+
        |  :8000   api        |   |  :4000   web         |
        |  Express 5          |   |  Next.js 16          |
        |  AppSail            |   |  Slate               |
        +---------------------+   +----------------------+
```

**Why the proxy exists, and why it is local only.** It would be simpler to let the
browser call the API directly, but then you have two origins: one for the frontend and
one for the API. That means CORS configuration, a second place to enforce login, and
cookies that do not travel cleanly between the two. The proxy collapses that into a
single origin and sets `catalyst_auth: true`, so login is enforced once, at the edge,
before any request reaches your code.

In the cloud, Catalyst provides that single origin and auth gate natively - so **the
proxy is never deployed**. It exists purely to reproduce production's shape on your
machine. It is listed in `catalyst.json` so `catalyst serve` can run it, and
`pnpm deploy` ships only `appsail:api` and `slate:web`. Do not add it to the deploy
list.

The local port map mirrors the deployed topology exactly, so a request path that works
in `pnpm dev` works after `pnpm deploy`. The frontend always calls `/api/...` as a
relative path and never needs to know where the API lives.

**Two things to internalise before you start.** First, the entry port is assigned by
the Catalyst CLI - it takes the first free port from 3000 upward, so in practice it is
usually **3001**. Read the URL `catalyst serve` prints rather than assuming 3000.
Second, you must go *through* `catalyst serve`: it injects the Catalyst project headers
that the SDK parses off each request. Hitting the proxy or the API directly serves the
frontend fine but makes every `/api` call fail with `app/invalid_project_details`.

---

## Prerequisites

| Requirement | Why |
|---|---|
| **Node.js 24** | The API AppSail declares `"stack": "node24"` in `app-config.json`. Matching locally avoids surprises at deploy time. |
| **pnpm 10.28.1** | Pinned via `packageManager` in the root `package.json`. `corepack enable` will honour it. |
| **Catalyst CLI** | `npm install -g zcatalyst-cli` |
| **A Catalyst account** | `catalyst login` (one time, opens a browser) |
| **A Catalyst project** | Create one in the [Catalyst console](https://console.catalyst.zoho.com), or let `catalyst init` create it for you. |

---

## First run

**1. Install dependencies**

```bash
pnpm install
```

**2. Bind the repo to your Catalyst project**

```bash
catalyst init
```

Pick (or create) your project and environment when prompted. This writes `.catalystrc`
at the repo root, holding your project ID, environment, and domain. That file is
**gitignored and per-developer** - every teammate runs `catalyst init` themselves, and
you never commit it.

Do not confuse it with `catalyst.json`, which *is* committed. That one declares what
this repo deploys (two AppSails and one Slate app) and is the same for everybody.

**3. Set up environment variables**

```bash
cp .env.example .env
```

The root `.env` is shared by every app. App-specific values go in `apps/<app>/.env`.
Both are gitignored; the `.env.example` files are committed.

Platform values, read by the Catalyst CLI and SDK rather than by this repo's code:

| Variable | Purpose |
|---|---|
| `X_ZOHO_CATALYST_IS_LOCAL` | Tells the Catalyst SDK it is running outside the cloud. |
| `X_ZOHO_CATALYST_ACCOUNTS_URL` | Accounts endpoint for your data centre. |
| `X_ZOHO_CATALYST_CONSOLE_URL` | Console endpoint for your data centre. |
| `X_ZOHO_STRATUS_RESOURCE_SUFFIX` | Suffix for Stratus bucket resource names. |
| `CATALYST_PORTAL_DOMAIN` | Your project's portal domain. |

These are declared in `turbo.json` under `globalPassThroughEnv`, so Turborepo forwards
them to every task without treating them as cache keys.

Values this repo's own code reads. Each is a key on the owning app's template - for
`apps/api` that is `src/env.ts` - so the app decides what it is configured with:

| Variable | Owner | Purpose |
|---|---|---|
| `AUTH_REDIRECT_URL` | `apps/api` | Where Catalyst sends a new user from the confirmation email. Locally the origin `catalyst serve` prints, usually `http://localhost:3001/`. |
| `TZ` | `apps/api` | Timezone for log timestamps. Defaults to `Asia/Kolkata`. |

These never go in `app-config.json` or any other Catalyst file - that file is committed,
and `.env` is not. `.claude/rules/environment.md` is the full rule.

**4. Start everything**

```bash
pnpm dev
```

One command starts everything: it bundles the proxy, runs `catalyst serve` in front of
it, and starts the API, the web app, and the shared-package watchers. You should see
something close to:

```
web:dev:   - Local:   http://localhost:4000
api:dev:   http://localhost:8000

 >>>>>>>>>>>>>> AppSail <<<<<<<<<<<<<<
 proxy: http://localhost:3001          <- open this one
 [proxy] http://localhost:4600
```

Two ports appear for the proxy and that is expected: `4600` is the port the CLI
injected into the proxy process, and `3001` is where the CLI fronts it for you.

**5. Open the URL the CLI printed**

Look for the `proxy:` line in the output - typically `http://localhost:3001`. Not
`:4000`, and not necessarily `:3000`. That entry point is the only address that routes
both the page and the API. You should get the Next.js starter page.

Confirm the API is wired up too, substituting the port you were given:

```bash
curl http://localhost:3001/api/ping
# {"data":{"message":"pong"},"status":"success"}
```

That response proves the whole chain: the proxy reached the API, `catalyst serve`
supplied the project headers, the execution context was created, and the shared
response envelope was applied. `apps/api/src/routes/ping.ts` is the route - copy it as
the shape for your own.

An unknown path returns the matching error envelope:

```bash
curl http://localhost:3001/api/nope
# {"status":"error","message":"The requested url does not exist."}
```

---

## Repository layout

```
.
|-- apps/
|   |-- proxy/          reverse proxy   -> local only, never deployed
|   |-- api/            Express API     -> AppSail "api"    :8000
|   `-- web/            Next.js app     -> Slate "web"      :4000
|-- packages/
|   |-- types/              @repo/types              shared API response shapes
|   |-- node-utils/         @repo/node-utils         execution context, logger, errors
|   |-- typescript-config/  @repo/typescript-config  base tsconfig
|   `-- eslint-config/      @repo/eslint-config      flat ESLint config
|-- appsails/           build output, gitignored, regenerated by `pnpm bundle`
|-- catalyst.json       committed: what this repo deploys
|-- .catalystrc         gitignored: your project binding, from `catalyst init`
|-- turbo.json          task pipeline
`-- pnpm-workspace.yaml workspace globs: apps/*, packages/*
```

| Workspace | Job |
|---|---|
| `apps/proxy` | Local development only. Routes `/api` to the API and everything else to the web app, including WebSocket upgrades for HMR. Enforces Catalyst login. Never deployed. |
| `apps/api` | Express API. Establishes a per-request execution context holding the Catalyst app, times requests, and maps typed errors to HTTP statuses. |
| `apps/web` | Next.js frontend. Calls the API with relative `/api/...` paths. |
| `@repo/types` | `RecordResponse`, `PagedRecordResponse`, `ErrorResponse` - imported by both the API and the web app so the contract is written once. |
| `@repo/node-utils` | `ExecutionContext` over `AsyncLocalStorage`, a `logger` that stamps execution IDs, `RuntimeError`, `env`, `HttpClient`, and the Catalyst wrappers plus the resource handles built from them. |
| `@repo/typescript-config` | `base.json`. Strict mode, `noUncheckedIndexedAccess`, ES2022. Every other tsconfig extends it. |
| `@repo/eslint-config` | Shared flat ESLint config. Every workspace re-exports it from its own `eslint.config.mjs`. |

---

## Commands

All run from the repo root.

| Command | Expands to | When you want it |
|---|---|---|
| `pnpm dev` | `concurrently ... "pnpm run serve < /dev/null" "turbo run dev"` | Day-to-day. Everything at once. Open the URL it prints. |
| `pnpm serve` | `turbo run bundle --filter=proxy && catalyst serve --only appsail:proxy` | The entry point alone, against your own already-running api/web. |
| `pnpm build` | `turbo build` | Typecheck and compile everything. `tsc --build && tsc-alias` in packages and the API, `next build` in web. |
| `pnpm bundle` | `turbo run bundle` | Produce deployable AppSail output in `appsails/`. Runs `build` first. |
| `pnpm lint` | `turbo lint` | ESLint across all five workspaces. |
| `pnpm typecheck` | `turbo typecheck` | `tsc --noEmit` across all five workspaces. |
| `pnpm deploy` | `turbo run bundle && catalyst deploy --only appsail:api,slate:web` | Ship the API and the frontend. The proxy is local only and is intentionally excluded. |

Scoping to one workspace:

```bash
pnpm --filter api dev
pnpm --filter web build
pnpm --filter @repo/types build
```

---

## How the build works

This is the part that is easy to get wrong when you add an app, so it is worth
understanding once.

Each AppSail app has a `scripts/bundle.mjs`. Running `pnpm bundle` executes it, and it:

1. **Wipes and recreates** `appsails/<name>/` at the repo root.
2. **Bundles** `src/index.ts` with esbuild - CommonJS, target node24, single `index.js`.
3. **Writes a trimmed `package.json`** with every `@repo/*` dependency removed.
4. **Copies `app-config.json`** next to it.
5. **Runs `npm install`** inside `appsails/<name>/` to fetch the real runtime deps.

Step 3 is the interesting one. Workspace packages like `@repo/node-utils` do not exist
on npm, so they cannot be installed at deploy time - instead esbuild **inlines their
code directly into `index.js`**. Third-party deps such as `express` stay external and
get installed normally.

The practical consequence: if a shared package needs something at *runtime* that is not
part of the bundle - reading a file relative to its own directory, loading a native
module - it will work under `tsx watch` locally and fail in AppSail. Keep shared
packages to pure code.

`appsails/` is gitignored. `catalyst.json` points each AppSail's `source` at the
matching directory there, which is how the CLI finds the output.

---

## Deploying

```bash
pnpm deploy
```

Which is `turbo run bundle && catalyst deploy --only appsail:api,slate:web`:

1. Turborepo builds the packages, then the API, then bundles into `appsails/`.
2. The CLI uploads `appsails/api/` as the `api` AppSail.
3. The CLI builds and uploads `apps/web` as the `web` Slate app.

**The proxy is not in that list, and must not be.** It is a local-development
component only - Catalyst gives you the single origin and auth gate natively in the
cloud. Deploying it would put a redundant hop in front of your app.

**Environment variables are not carried by the deploy.** `app-config.json` declares no
`env_variables`, on purpose - it is committed, so a value there is a value in git. Set
what the deployed app needs in **Console -> AppSail -> api -> Configuration ->
Environment Variables** before the first deploy that needs it, and remember that the
Development and Production environments are configured separately. `AUTH_REDIRECT_URL`
is required by `POST /api/auth/register`; without it that route fails with a
`RuntimeError` naming the variable.

**Environments.** Catalyst projects have a Development and a Production environment,
with separate data and separate IDs. `catalyst init` sets your active one and records
it in `.catalystrc`; check which one you are on before deploying. Note that the ZAID
differs between environments - this is the most common cause of authentication
breaking after promoting to Production.

**Slate.** The frontend is built by Slate itself, from
`apps/web/.catalyst/slate-config.toml` (`pnpm install`, then `pnpm run build`, output
`.next`). That file is generated and managed by the CLI - do not hand-edit it.

---

## Make it yours

This is a template. When you start a real solution:

**Rename the project.** In the root `package.json`, set `name` and point
`repository.url` at your own remote. The workspace package names (`@repo/*`) can stay -
they are private and never published.

**Rename or remove an app.** Four things move together, and all four must agree:

1. The directory under `apps/`.
2. The `outDir` in its `scripts/bundle.mjs` (`appsails/<name>/`).
3. Its entry in `catalyst.json` (`name` and `source`).
4. The `--only appsail:<name>` flags in the root `deploy` script.

If you do not need the split, the proxy is the piece to drop first - but then you own
CORS and auth enforcement yourself.

**Add a shared package.** Create `packages/<name>` with `"private": true`,
`"type": "module"`, the same subpath `exports` block as the existing packages, a
tsconfig extending `@repo/typescript-config/base.json`, and
`"build": "tsc --build && tsc-alias"`. Add it to consumers as `"workspace:*"`.

**Project-specific values** all live in `.catalystrc` (project ID, environment,
domain) and your `.env` files. Nothing project-specific is committed, so a fresh clone
plus `catalyst init` is genuinely all it takes.

---

## Conventions

Short version; `CLAUDE.md` has the full list.

- **Path alias.** `@/*` resolves to `./src/*` in every workspace. Use it rather than
  climbing with `../../`.
- **Subpath imports.** Shared packages have no barrel file. Import the exact module:
  `@repo/types/api`, `@repo/node-utils/framework/logger`.
- **File names** are snake_case: `http_error.ts`, `async_context.ts`.
- **Naming.** Identifiers and JSON keys are camelCase: `emailId`, `nextPageToken`. A
  vendor's own wire shape (`email_id`, `ROWID`) keeps its spelling and is converted at
  the wrapper.
- **Errors.** In the API, throw `HttpError.BadRequest(...)` and friends instead of
  setting a status by hand. The terminal error handler maps them; anything unrecognised
  becomes a generic 500.
- **Responses.** Build every payload with `toRecordResponse`, `toPagedResponse`, or
  `toErrorResponse` so clients always get the same `status` / `data` envelope.
- **Logging.** Use `logger` from `@repo/node-utils`, not `console`. It attaches the
  execution ID and per-request ordering.
- **Catalyst SDK.** `zcAuth.init(req)` happens once per request in middleware. Handlers
  import a resource handle from `@repo/node-utils/services/catalyst/resources` and never
  initialize their own app.
- **Ports** come from `X_ZOHO_CATALYST_LISTEN_PORT` with a local fallback. Never
  hardcode.
- **Underscore-prefixed params** (`_req`, `_next`) mark arguments a signature requires
  but the body does not use. The shared lint rule is configured to permit exactly that.

Every workspace shares one flat ESLint config from `@repo/eslint-config`, so
`pnpm lint` and `pnpm typecheck` cover the whole repo.

> **Do not bump TypeScript to 7.** It is pinned to 5.9.x because typescript-eslint
> refuses TS 7 outright, which disables linting in every workspace including `web`.

---

## Troubleshooting

**Everything 502s and `catalyst serve` printed nothing** - the CLI is hung waiting on
stdin. When stdin is not a terminal it waits for EOF before starting the AppSail, and a
task runner's pipe never sends one. The front port binds before that step, which is why
it looks like a proxy fault rather than a hung process. Redirect stdin from `/dev/null`
as the root `dev` script does, and never remove that redirect. Typing `catalyst serve`
in a terminal is unaffected - a terminal takes the interactive path.

**Every `/api` call returns 500 `Something went wrong`** - you are bypassing
`catalyst serve`. Only the CLI injects the project headers the Catalyst SDK parses, so
`zcAuth.init(req)` throws `app/invalid_project_details`. The API log shows the
real error. Use the CLI's printed URL, not `:8000` or a hand-started proxy.

**You cannot find the app on port 3000** - the CLI takes the first free port from 3000
upward, so it is often 3001 or 3002. Read the `proxy:` line in the `pnpm dev` output.

**`Port 4000 is already in use`** - a previous run is still up.
`lsof -ti:4000 | xargs kill` and retry. Same for 8000.

**`catalyst serve` starts but the page is blank or 502** - the proxy is running but its
upstreams are not. `pnpm dev` starts all three; if you ran `pnpm serve` alone, the API
and web app are not up.

**`catalyst serve` cannot find the app** - `appsails/proxy/` does not exist yet. Run
`pnpm bundle` first. `pnpm dev` does this for you.

**Your proxy change has no effect** - the proxy runs from bundled output, not from
`src/`. Re-run `pnpm bundle`.

**Stale behaviour after renaming or deleting an app** - `appsails/` is only rebuilt for
apps that still have a bundle script. Delete the directory and re-run `pnpm bundle`.

**`Cannot find module '@repo/...'`** - the shared packages have not been built. Run
`pnpm build`, or use `pnpm dev`, which keeps them in watch mode.

**Catalyst CLI errors about a missing project** - you have not run `catalyst init` in
this clone, so there is no `.catalystrc`. It is gitignored by design; every developer
runs it once.

**`.env not found. Continuing without it.`** - harmless. The API looks for both the
root `.env` and an optional `apps/api/.env`; the message is the latter, which most
setups do not need.

**Authentication works in Development but breaks in Production** - the ZAID differs
per environment. Check which environment `.catalystrc` has active.

---


## Working with AI

`CLAUDE.md` files are checked in at the root (`.claude/CLAUDE.md`), in each app, and in
`packages/`. They cover architecture, conventions, and the patterns to follow, so an
agent picks up the house style without being told each time.

Alongside them, `.claude/rules/` holds one file per topic, loaded automatically:

| Rule | Covers |
|---|---|
| `catalyst_sdk.md` | every Catalyst SDK call, and the wrappers they go through |
| `outbound_http.md` | every call to a service outside this repo |
| `web_data_access.md` | every call the browser makes to our own API, and every form |
| `environment.md` | every environment variable - who declares it and where values live |
| `typography.md` | fonts: one family, named in one file |

A rule that applies to only part of the tree says so in `paths:` frontmatter, the way
`web_data_access.md` and `typography.md` scope themselves to `apps/web/**`.

Keep all of it accurate when you change the structure - a stale one is worse than none.
Put a new convention in `.claude/rules/` rather than growing a `CLAUDE.md`.
