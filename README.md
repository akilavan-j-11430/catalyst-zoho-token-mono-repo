# catalyst-zoho-token-mono-repo

A monorepo starter kit for building customer solutions on
[Zoho Catalyst](https://catalyst.zoho.com), carrying a working Zoho OAuth connection.
Clone it, point it at your own Catalyst project with `catalyst init`, and you have a
running full-stack application in a few minutes.

**What you get out of the box**

- A **Next.js 16** frontend (React 19, Tailwind 4) deployed as a Catalyst Slate app.
- **Server-side data in the web app**: pages read Catalyst in their Server Components and
  forms write through Server Actions, on the modular `@zcatalyst/*` SDKs, with a
  per-request execution context and structured logging.
- **Sign-in and sign-up pages**: Catalyst's hosted sign-in widget at `/sign-in`, and a
  sign-up form that registers the user through a Server Action. The home page needs a
  signed-in user and shows their account.
- A **reverse proxy** AppSail, for local development only, that gives the stack a single
  origin and passes Catalyst's sign-in paths through to Catalyst.
- **Shared TypeScript packages** for shared types, runtime utilities, and a common
  tsconfig - wired up with pnpm workspaces.
- A **Turborepo pipeline** so packages build in dependency order, plus one-command bundle
  and deploy.

- A **Zoho OAuth connection** on the home page: the authorization-code flow with signed
  CSRF state, started and finished by Server Actions, with a confirm dialog before
  disconnecting. The refresh token is stored in a Data Store table this repo owns, and the
  access token minted on demand behind an in-memory LRU over Catalyst Cache. Credentials
  live in `.env`, never in a committed Catalyst file.

It is deliberately small. Beyond the Zoho connection there is no domain layer and no example
CRUD resource - just the plumbing that every Catalyst solution ends up needing, done once
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
                            |
                            |   /*
                            v
              +-----------------------------+
              |  :4000   web                |
              |  Next.js 16                 |
              |  Slate                      |
              +-----------------------------+
```

**Why the proxy exists, and why it is local only.** Locally the proxy puts the web app -
and any app added later that serves HTTP - behind one origin. The browser's session cookie
and the Catalyst headers `catalyst serve` injects then reach the app with no extra setup.
Its `catalyst_auth: true` gates no page: it has `catalyst serve` pass Catalyst's own sign-in
paths (`/accounts`, `/oauthorize`) through to Catalyst, which the sign-in widget and sign-out
need, while `src/proxy.ts` in the web app decides who sees which page. It is listed in
`catalyst.json` so `catalyst serve` can run it, and `pnpm run deploy` ships only
`slate:web`. **Do not add it to the deploy list.**

**The web app reads and writes on its own server.** A page reads Catalyst in its Server
Component and a form writes through a Server Action, both on Next's server, with the
Catalyst app built from the `x-zc-*` headers on the request. The browser calls no backend of
ours, so there is no API URL, token or CORS to set up for it.

Slate serves the web app from `*.onslate.com`. Locally `catalyst serve` adds those headers;
in the cloud that rests on Slate passing them to Next's server, which is still unproven and
is checked on the first Slate deploy - "The first Slate deploy" below says how, and what to
do if it fails.

**No API app ships.** A caller outside the web app - a mobile app, a webhook, another
service - is served by an API app, an Advanced I/O function or an AppSail, added when the
first such caller arrives; `.claude/rules/node-api/code-placement.md` says which.

**Two things to internalise before you start.** First, the entry port is assigned by
the Catalyst CLI - it takes the first free port from 3000 upward, so in practice it is
usually **3001**. Read the URL `catalyst serve` prints rather than assuming 3000.
Second, you must go *through* `catalyst serve`: it injects the Catalyst project headers
that the SDK parses off each request. Hitting the proxy or `:4000` directly serves the
static parts fine but makes every Catalyst read fail with `app/invalid_project_details`.

---

## Prerequisites

| Requirement | Why |
|---|---|
| **Node.js 24** | The proxy AppSail declares `"stack": "node24"` in `app-config.json`, as every AppSail and function the skills add does. Matching locally avoids surprises at deploy time. |
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

`apps/web/next-env.d.ts` is generated, not committed, so on a fresh clone the editor lacks
Next's types (image imports, route types) until the first `pnpm dev`, `pnpm build` or
`pnpm typecheck` creates it.

**2. Bind the repo to your Catalyst project**

```bash
catalyst init
```

Pick (or create) your project and environment when prompted. This writes `.catalystrc`
at the repo root, holding your project ID, environment, and domain. That file is
**gitignored and per-developer** - every teammate runs `catalyst init` themselves, and
you never commit it.

`catalyst.json`, beside it, is committed: it declares what this repo runs and deploys - the
local-only proxy AppSail and one Slate app - and `catalyst serve` and the `deploy` script read
it. It names no project, so it is the same for every developer.

Then, in the Console for that project and environment, turn on **Authentication** with the
hosted sign-in, and public sign-up if people register themselves - the sign-in and sign-up
pages need it. Each table you add later needs its App User permissions set in **Data Store ->
the table -> Scopes & Permissions**: an App User can read by default, and insert, update and
delete only once you allow them. A write without permission throws a `CatalystError`, so
check this first when an action that works as Admin fails for a signed-in user.

The Zoho connection needs one table, **`ZohoConnection`**, with two text columns:
`REFERENCE_ID` and `REFRESH_TOKEN`, the latter encrypted. Set its App User scope to **USER**,
so each user reads back only the row their own credentials created, and allow App Users to
insert - the grant is stored as the signed-in user, and deleted as Admin.

**3. Fill in the environment**

The app starts without any of this, but the Zoho connection needs its four keys.
Each deployable has its own `.env`, gitignored, beside a committed `.env.example` that lists
every key with a comment and no value. The proxy's needs nothing, since `catalyst serve` sets
everything it reads. The web app's is the one to fill in:

```bash
cp apps/web/.env.example apps/web/.env
```

Then fill `apps/web/.env` in:

- **`TZ`** - optional. Your timezone for log timestamps, e.g. `Asia/Kolkata`; blank keeps the
  logger's default, `Asia/Kolkata`.
- **The four Zoho OAuth keys**, from a Server-based client at https://api-console.zoho.com:
  `ZOHO_TOKEN_CLIENT_ID`, `ZOHO_TOKEN_CLIENT_SECRET`, `ZOHO_TOKEN_SCOPES` (comma-separated,
  e.g. `ZohoCRM.modules.ALL,ZohoCRM.settings.READ`) and `ZOHO_TOKEN_ACCOUNTS_URL` (the DC's
  accounts server, e.g. `https://accounts.zoho.in`). Set the client's Authorized Redirect
  URI to the origin `catalyst serve` prints plus `/zoho-token/callback` - e.g.
  `http://localhost:3001/zoho-token/callback` - and add the Slate domain's the same way
  before deploying. The app builds the redirect uri from the request's origin, so no key
  names it.

The Catalyst SDK also reads five keys of its own - `X_ZOHO_CATALYST_IS_LOCAL`,
`X_ZOHO_CATALYST_ACCOUNTS_URL`, `X_ZOHO_CATALYST_CONSOLE_URL`, `CATALYST_PORTAL_DOMAIN` and
`X_ZOHO_STRATUS_RESOURCE_SUFFIX`. You do not set them locally: `catalyst serve` works them out
from the project and data centre you signed in to and sets them for the proxy, and `pnpm dev`
asks the proxy for them and hands them to every app it starts.

They are local only - never set them in the Console. While `pnpm dev` runs, read the values
with `curl http://localhost:3001/__common/env`, using the port it printed.

On Slate, set `TZ` and the four Zoho keys in **Console -> Slate -> web -> Environment
Variables**.

A function, an AppSail or a second app gets its own `.env.example` from the skill that adds
it. Never put a value in `app-config.json` or any other Catalyst file - those are committed,
and `.env` is not. `.claude/rules/general/environment.md` is the full rule.

**4. Start everything**

```bash
pnpm dev
```

One command starts everything: it bundles the proxy, runs `catalyst serve` in front of
it, and starts the web app and the shared-package watchers. You should see something
close to:

```
[dev] Catalyst serve is ready - open http://localhost:3001     <- open this one
...
web:dev:   - Local:   http://localhost:4000
```

`catalyst serve` itself prints nothing here - `pnpm dev` drops its output. If it stops
before it is ready, `pnpm dev` says so; run `pnpm spawn:proxy` on its own to see the CLI's
own messages.

**5. Open the URL `pnpm dev` printed**

Look for the `[dev] Catalyst serve is ready` line - typically `http://localhost:3001`. Not
`:4000`, and not necessarily `:3000`. That entry point is the only address that carries
the Catalyst headers. Sign in, and the home page reads your account from Catalyst on the
server. That proves the whole chain: `catalyst serve` supplied the project headers, and the
page's execution context built the Catalyst app from them. `apps/web/src/app/(app)/page.tsx`
is the page - copy it as the shape for your own.

---

## Repository layout

```
.
|-- apps/
|   |-- proxy/          reverse proxy   -> local only, never deployed
|   `-- web/            Next.js app     -> Slate "web"      :4000
|-- packages/
|   |-- types/              @repo/types              shapes two workspaces use
|   |-- async-context/      @repo/async-context      the execution context of the request in flight
|   |-- logger/             @repo/logger             Logger, one block per line
|   |-- catalyst-node/      @repo/catalyst-node      Catalyst wrappers and CatalystSession
|   |-- env/                @repo/env                defineEnv, each app's declared variables
|   |-- http-client/        @repo/http-client        HttpClient, for Node and the browser
|   |-- input-validation/   @repo/input-validation   zod-checked input, InvalidInputError
|   |-- repositories/       @repo/repositories       resource handles, ZohoConnectionRepository
|   |-- zoho-token/         @repo/zoho-token         ZohoConnection, ZohoAccounts
|   |-- case-conversion/    @repo/case-conversion    vendor keys -> camelCase
|   |-- testing/            @repo/testing            shared Vitest config
|   |-- typescript-config/  @repo/typescript-config  base tsconfig
|   `-- eslint-config/      @repo/eslint-config      flat ESLint config
|-- appsails/           AppSail bundles, gitignored, regenerated by `pnpm bundle`
|-- slate/              the staged Slate app, gitignored, regenerated by `pnpm bundle`
|-- catalyst.json       what this repo runs and deploys
|-- .catalystrc         gitignored: your project binding, from `catalyst init`
|-- turbo.json          task pipeline
`-- pnpm-workspace.yaml workspace globs: apps/*, packages/*
```

| Workspace | Job |
|---|---|
| `apps/proxy` | Local development only. Routes every path to the web app, including WebSocket upgrades for HMR. Enforces Catalyst login. Never deployed. |
| `apps/web` | Next.js frontend. Pages read Catalyst in their Server Components and forms write through Server Actions, on its own server. |
| `@repo/types` | Shapes two workspaces use - the user shapes, and the HTTP response `HttpClient` returns - written once. |
| `@repo/async-context` | `ExecutionContext` over `AsyncLocalStorage` - the execution id and extras of the request in flight. |
| `@repo/logger` | `Logger.for(source)` on pino - each line a block naming its source and, inside a request, the execution id and order. |
| `@repo/env` | `defineEnv` - each app declares the variables it reads, so a typo is a compile error and an unset one throws `MissingEnvVariableError`. |
| `@repo/catalyst-node` | `CatalystSession` and the Catalyst wrappers - the only package that imports `@zcatalyst/*`. Each entry point sets the apps it needs on its execution context with `CatalystSession.setApp`, and every wrapper reads them from there. |
| `@repo/http-client` | `HttpClient` - every call to a service outside this repo. Reads nothing ambient, so it runs in Node and in the browser. |
| `@repo/case-conversion` | `CamelCase.convertKeys` - renames a vendor's snake_case or kebab-case keys at any depth, for `catalyst-node`. Framework-free, so the web app may use it too. |
| `@repo/testing` | `VitestProjects.forWorkspace`, the Vitest settings every tested workspace starts from. Dev-only - see `.claude/rules/general/testing.md`. |
| `@repo/typescript-config` | `base.json`. Strict mode, `noUncheckedIndexedAccess`, ES2022. Every other tsconfig extends it. |
| `@repo/eslint-config` | Shared flat ESLint config. Each workspace spreads it into its own `eslint.config.mjs` and adds its exemptions - `allowTestsIn([...])` when it has tests. |

---

## Commands

All run from the repo root.

| Command | Expands to | When you want it |
|---|---|---|
| `pnpm dev` | `node scripts/dev.mjs` - `pnpm run spawn:proxy`, then `turbo run dev` with the Catalyst SDK keys the proxy serves | Day-to-day. Everything at once. Open the URL it prints. |
| `pnpm spawn:proxy` | `turbo run bundle --filter=proxy && catalyst serve --only appsail:proxy` | The entry point alone, against your own already-running web app. |
| `pnpm build` | `turbo build` | Compile everything - `src/` only; tests are type-checked by `pnpm typecheck`. `tsc --build tsconfig.build.json && tsc-alias -p tsconfig.build.json` in packages, `next build` in web. |
| `pnpm bundle` | `turbo run bundle` | Produce the proxy's AppSail output in `appsails/` and the staged Slate app in `slate/web/`. Runs `build` first. |
| `pnpm lint` | `turbo lint` | ESLint in every workspace with code - test files included. |
| `pnpm typecheck` | `turbo typecheck` | `tsc --noEmit` in every workspace with code, tests included. |
| `pnpm test:unit` | `turbo test:unit` | Unit tests (`test/unit/` in each tested workspace). No network, Catalyst SDKs mocked. |
| `pnpm test:integration` | `turbo test:integration` | Integration tests (`test/integration/`): `HttpClient` against a local server. Catalyst is still faked, so no `catalyst serve`. |
| `pnpm verify` | `turbo run build lint typecheck test:unit test:integration` | Before calling a change done. Build, lint, typecheck and both test suites in one run - not `bundle`: run that too after a dependency or `scripts/bundle.mjs` change. |
| `pnpm run deploy` | `turbo run bundle && catalyst deploy --only slate:web` | Ship the frontend. The proxy is local only and is intentionally excluded. |

Scoping to one workspace:

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter @repo/types build
pnpm turbo run test:unit --filter=@repo/logger   # tests go through turbo, so the packages they import are rebuilt first
```

---

## How the build works

This is the part that is easy to get wrong when you add an app, so it is worth
understanding once.

Each AppSail has a `scripts/bundle.mjs`. Running `pnpm bundle` executes it, and for an
AppSail that imports `@repo/*` packages - an API app, once there is one
(`.claude/rules/node-api/express-app.md`) - it:

1. **Wipes and recreates** `appsails/<name>/` at the repo root.
2. **Bundles** `src/index.ts` with esbuild - CommonJS, target node24, single `index.js`.
3. **Writes a trimmed `package.json`** with every `@repo/*` dependency removed.
4. **Copies `app-config.json`** next to it.
5. **Runs `npm install`** inside `appsails/<name>/` to fetch the real runtime deps.

Step 3 is the interesting one. Workspace packages like `@repo/logger` do not exist
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
pnpm run deploy
```

Always `pnpm run deploy`: a bare `pnpm deploy` runs pnpm's own command of that name, not
this script. It is `turbo run bundle && catalyst deploy --only slate:web`:

1. Turborepo builds the packages, then stages `apps/web` in `slate/web/` with its `@repo/*`
   packages vendored in.
2. The CLI uploads `slate/web/` as the `web` Slate app, which Slate then builds.

**The proxy is not in that list, and must not be.** It is a local-development
component only. In the cloud the web app reads and writes on its own server.

**The web app's keys** - `TZ` and the four Zoho keys from step 3 - are
set in **Console -> Slate -> web -> Environment Variables**, once per environment. The server
reads them at request time. Sign-up needs no redirect key: the Server Action sends new users
to the origin the request came from. Step 3 documents each one, and a local `apps/web/.env`
never reaches Slate, because the bundle leaves it out.

**Environment variables are not carried by the deploy.** No Catalyst file declares one, on
purpose - those files are committed, so a value there is a value in git. Set what a deployed
app needs in the Console before the first deploy that needs it, and remember that the
Development and Production environments are configured separately.

**Environments.** Catalyst projects have a Development and a Production environment,
with separate data and separate IDs. `catalyst init` sets your active one and records
it in `.catalystrc`; check which one you are on before deploying. Note that the ZAID
differs between environments - this is the most common cause of authentication
breaking after promoting to Production.

**Slate.** The frontend is built by Slate itself, from the staged copy in `slate/web/`
(`npm install`, then `npm run build`, output `.next`). Slate cannot resolve
`workspace:*`, so the bundle step copies each `@repo/*` package's `dist/` into
`slate/web/vendor/` and rewrites the staged `slate-config.toml` to npm. The source
`apps/web/.catalyst/slate-config.toml` is generated and managed by the CLI - do not
hand-edit it. It applies to the first deployment only, so set the Slate app's install and
build commands to npm in the Console as well.

### The first Slate deploy

Before it, in the Console:

- Activate Slate once per project (**Slate -> Start Exploring**). Until then a deploy fails
  with HTTP 400.
- Set the `web` app's install and build commands to `npm install` and `npm run build`, and
  its `TZ` (above).
- Turn on Authentication with the hosted sign-in, and public sign-up if people register
  themselves. Whether the sign-in widget needs `*.onslate.com` as an authorized domain is not
  checked yet - if the widget does not load on Slate, look there first.

After it, check the one thing the design rests on: that Slate hands Next's server the
`x-zc-*` headers the Catalyst app is built from.

1. Open the deployed app signed out - `/` should send you to `/sign-in`. Sign in - `/` should
   show your account. If both happen, Slate ran `src/proxy.ts` and the User app was built
   from the headers, and the check is done.
2. If `/` keeps sending you back to `/sign-in` (no `x-zc-user-type: project-user`), shows the
   error page signed out (the proxy did not run) or signed in (the user type arrived but the
   User app could not be built), or every read fails, find out which headers arrive - **by
   name only**, because their values are credentials. Log
   `[...(await headers()).keys()].filter((name) => name.startsWith("x-zc-"))` and the value
   of `x-zc-user-type` from one page, deploy, read the log, then remove the line.
3. If the credential headers are missing, stop and bring it back to the team: the web app
   cannot call Catalyst as the user from its server. The fallback is an API app the browser
   calls directly (`.claude/rules/node-api/express-app.md`).

---

## Make it yours

This is a template. When you start a real solution:

**Rename the project.** In the root `package.json`, set `name`. The workspace package names
(`@repo/*`) can stay - they are private and never published.

**Rename or remove an app.** Four things move together, and all four must agree:

1. The directory under `apps/`.
2. The `outDir` in its `scripts/bundle.mjs` (`appsails/<name>/`).
3. Its entry in `catalyst.json` (`name` and `source`).
4. The `--only` flags in the root `deploy` script (`appsail:<name>`, `slate:<name>`).

The proxy is local only, so dropping it changes only local development.

**Add a shared package.** Create `packages/<name>` with `"private": true`,
`"type": "module"`, the same subpath `exports` block as the existing packages, a
`tsconfig.json` extending `@repo/typescript-config/base.json` plus a `tsconfig.build.json`
extending that one for the emit (copy them from `packages/types`, which is framework-free), and
the four scripts - `build`, `dev`, `typecheck`, `lint` - and the devDependencies they run
(`@repo/eslint-config`, `@repo/typescript-config`, `concurrently`, `eslint`), copied from
`packages/async-context/package.json`. Turbo skips a workspace without a script, so a missing
`lint` or `typecheck` drops it from `pnpm verify` silently, and a missing `dev` leaves the apps
reading a stale `dist/`. Add it to consumers as `"workspace:*"`.

**Project-specific values** all live in `.catalystrc` (project ID, environment,
domain) and your `.env` files. Nothing project-specific is committed, so a fresh clone
plus `catalyst init` is genuinely all it takes.

**Know the sign-up gap.** Sign-up is a public Server Action that runs as Admin, and nothing
limits how often it is called. Anyone can script it to make Catalyst create pending users and
send confirmation emails to any address. The kit cannot rate-limit it, so before going live
decide whether public sign-up stays on (**Authentication** in the Console), or whether users
are invited instead.

---

## Conventions

Short version; `CLAUDE.md` has the full list.

- **Path alias.** `@/*` resolves to `./src/*` in every app and every built package. Use it rather than
  climbing with `../../`.
- **Subpath imports.** Shared packages have no barrel file. Import the exact module:
  `@repo/types/user`, `@repo/logger/logger`.
- **File names** are kebab-case: `http-error.ts`, `async-context.ts`.
- **Naming.** Identifiers and JSON keys are camelCase: `emailId`, `nextPageToken`. A
  vendor's own wire shape (`email_id`, `ROWID`) keeps its spelling and is converted at
  the wrapper.
- **Logging.** Use `Logger.for("<source>")` from `@repo/logger`, not `console`. It attaches
  the source and, inside a request, the execution ID and per-request ordering.
- **Catalyst SDK.** `zcAuth.init(req)` happens once per request, at the entry point -
  `withCatalystPage` / `withCatalystFn` in the web app. Code below it reads a table through
  its repository in `@repo/repositories`, takes a bucket, cache or job handle from
  `@repo/catalyst-node/resources`, and never initializes its own app.
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

**You keep landing on sign-in, or sign-up fails** - you are bypassing `catalyst serve`.
Only the CLI injects the `x-zc-*` headers the Catalyst SDK parses, so the web app sees no
signed-in user and `zcAuth.init` throws `app/invalid_project_details`. The web server's log
shows the real error. Use the CLI's printed URL, not `:4000` or a hand-started proxy.

**You cannot find the app on port 3000** - the CLI takes the first free port from 3000
upward, so it is often 3001 or 3002. Read the `[dev] Catalyst serve is ready` line in the `pnpm dev` output.

**`Port 4000 is already in use`** - a previous run is still up.
`lsof -ti:4000 | xargs kill` and retry.

**`catalyst serve` starts but the page is blank or 502** - the proxy is running but the
web app is not. `pnpm dev` starts both; if you ran `pnpm spawn:proxy` alone, the web app is not
up.

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
| `catalyst-sdk.md` | every Catalyst SDK call, and the wrappers they go through |
| `outbound-http.md` | every call to a service outside this repo |
| `code-placement.md` | where a page's read, a Server Action and a route handler start in `apps/web` |
| `forms.md` | every form, and how it calls its Server Action |
| `environment.md` | every environment variable - who declares it and where values live |
| `typography.md` | fonts: one family, named in one file |

A rule that applies to only part of the tree says so in `paths:` frontmatter, the way
`code-placement.md`, `forms.md` and `typography.md` scope themselves to `apps/web/**`.

Keep all of it accurate when you change the structure - a stale one is worse than none.
Put a new convention in `.claude/rules/` rather than growing a `CLAUDE.md`.
