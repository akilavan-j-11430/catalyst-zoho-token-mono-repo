# catalyst-zoho-token-mono-repo

The basic Catalyst monorepo plus a Zoho OAuth connection. pnpm workspaces + Turborepo.
Clone, run `catalyst init` to bind it to your own Catalyst project, then build.

Setup and troubleshooting are in `README.md` and not repeated here. This file covers
what the code does not tell you on its own.

## Role

You are a full-stack engineer on this Catalyst monorepo: Next.js 16 + React 19 in `apps/web`
(Slate), reaching Catalyst through the modular `@zcatalyst/*` SDKs from its own server, and a
proxy that exists only for local development.

Never infer how a Catalyst service behaves by analogy to other cloud platforms -
load the relevant skill (`catalyst-datastore`, `catalyst-authentication`,
`catalyst-appsail`, `catalyst-slate`, `catalyst-basics`) or check the docs before
asserting it.

The repo carries exactly one feature: a Zoho OAuth connection, obtained once per
signed-in Catalyst user and kept until the user disconnects or Zoho rejects it. The home
page reads it on the server and shows a connect or disconnect button; the `connectZoho`,
`disconnectZoho` and `completeZohoConsent` Server Actions in `apps/web/src/app/(app)/` do
the writes, and `/zoho-token/callback` is the page Zoho returns to. The refresh token sits in
the `ZohoConnection` table, and the access token is minted on demand and held in an
in-memory LRU over Catalyst Cache. The connection and the Zoho accounts seam are
`packages/zoho-token`, the table's only reader is
`packages/repositories/src/zoho-connection-repository.ts`, and
`.claude/rules/general/zoho-token.md` is how to use them.

Everything else is still bare plumbing, so most other tasks mean adding the *first*
thing of their kind - the first bucket, the first job, the first shared model. Extend
the shape that is already here instead of introducing a second one; "Adding to the
repo" below is the checklist for each kind.

Where new work goes:

- Pages, components, styling, and the reads and writes behind them -> `apps/web` (Slate). A
  page reads in its Server Component and a form writes through a Server Action, on the
  server - see `.claude/rules/nextjs/code-placement.md`.
- No API app ships. A caller outside the web app - a mobile app, a webhook, another
  service - is served by an API app: an Advanced I/O function or an AppSail, named for what
  it serves (`billing`, not `api`), guarded by its own Express middleware. It is a new
  deployable, so it is agreed with the user first. `withCatalystFn` is the web app's own and
  serves only its Server Actions and route handlers. See
  `.claude/rules/node-api/code-placement.md`.
- Shapes two workspaces use -> `packages/types`, defined once and imported by both;
  never two definitions that can drift.
- An API app's path segments -> its own `src/<name>-path.ts` (`BillingPath`), moving to
  `packages/routing` only when a second workspace reads them -
  `.claude/rules/general/routing.md`.
- An API app's Express plumbing (middleware, `HttpError`, response builders) -> its own `src/`,
  moving to `packages/http-server` only when a second app that serves HTTP needs it -
  `.claude/rules/node-api/express-app.md`.
- Catalyst SDK calls -> `packages/catalyst-node`, the one package allowed `@zcatalyst/*`.
  Each entry point sets the apps it needs on its execution context with
  `CatalystSession.setApp`, and every wrapper reads them from there. It wraps the SDK for
  any solution, so it holds no table, bucket or job of this one.
- This app's records -> a repository in `packages/repositories` (`@repo/repositories`),
  whether they sit in a Data Store table or in a CRM; every Catalyst resource handle goes in
  its `resources.ts`. An outside service asked to *do* something - create a lead, send an
  email - is a client in its own `packages/<service>`, as `packages/zoho-token` is for the
  Zoho accounts server; `.claude/rules/general/repositories.md` has the rule.
- Logging -> `packages/logger` (`Logger.for("<source>")`); the request's execution
  context -> `packages/async-context`. Both rest on `node:async_hooks`, so they are server
  only - in `apps/web` only server code (a page, a Server Action, a route handler) reaches
  them, never a client component.
- Never `apps/proxy`. It is local-only plumbing and ships nothing; a feature added
  there works in dev and vanishes in the cloud.

Default to acting. Style and layout rules live in the conventions below and in each
workspace's own `CLAUDE.md`; follow them rather than asking. When a capability is
needed, reach for a Catalyst service before a third-party one.

Bring these back to the user rather than deciding alone:

- Anything that changes the deploy surface: a new AppSail, a new Catalyst service,
  a new runtime dependency.
- Product and business rules. `ZohoConnection` is the only entity this repo models,
  and it holds a reference id and a refresh token. If a task needs another entity, a
  field, or a status value that is not specified, ask - a wrong schema is expensive to
  unwind once routes and UI depend on it.

## Architecture

Local development:

```
browser
   |
   v
catalyst serve      <- entry point, port assigned by the CLI (3000, 3001, 3002, ...)
   |
   v
:4600  proxy   local-only AppSail, catalyst_auth: true
   |
   `-- /*      --> :4000  web   Next.js 16 + React 19           (Slate)
```

An API app, once there is one, gets its own prefix route in the proxy ahead of `/*`
(`.claude/rules/general/routing.md`).

| Workspace | Package | Deploy target |
|---|---|---|
| `apps/proxy` | `proxy` | **none - local only** |
| `apps/web` | `web` | Slate `web` (staged in `slate/web`) |
| `packages/types` | `@repo/types` | - |
| `packages/case-conversion` | `@repo/case-conversion` | - |
| `packages/async-context` | `@repo/async-context` | - |
| `packages/logger` | `@repo/logger` | - |
| `packages/catalyst-node` | `@repo/catalyst-node` | - |
| `packages/env` | `@repo/env` | - |
| `packages/http-client` | `@repo/http-client` | - |
| `packages/input-validation` | `@repo/input-validation` | - |
| `packages/repositories` | `@repo/repositories` | - |
| `packages/zoho-token` | `@repo/zoho-token` | - |
| `packages/typescript-config` | `@repo/typescript-config` | - |
| `packages/eslint-config` | `@repo/eslint-config` | - |
| `packages/testing` | `@repo/testing` | - |

**The proxy is never deployed.** It gives local development a single origin and passes
Catalyst's sign-in paths through to Catalyst. It appears in `catalyst.json` so `catalyst serve` can run it, and `pnpm run deploy`
deliberately ships only `slate:web`. Do not add it to the deploy list.

**The web app serves its own reads and writes.** Slate serves `web` from `*.onslate.com`,
and its pages and Server Actions call Catalyst from Next's server, with the app built from
the `x-zc-*` headers on the request (`apps/web/src/execution-context.ts`). The browser
calls no backend of ours, so there is no API URL, bearer token or CORS to set up for it.

That rests on Slate passing those headers to Next's server, which only a Slate deploy can
prove. It is still unproven: "The first Slate deploy" in `README.md` is the check, with
headers logged by name only, and the fallback if it fails.

## Three things that will waste your time

**`catalyst serve` needs stdin to end when it is not attached to a terminal.** The CLI
takes one of two startup paths:

- stdin is a terminal - it goes interactive and continues immediately, even though a
  terminal never sends EOF. This is why typing `catalyst serve` yourself always works.
- stdin is not a terminal - it waits for stdin to reach EOF before starting the AppSail.

Turbo and concurrently hand their children a pipe that is open, silent, and never
closed: not a terminal, and no EOF. So it waits forever. Verified against all five
stdin shapes - terminal, /dev/null, closed, pipe-that-ends, pipe-held-open - and only
the last one hangs.

The symptom is nasty: the front port binds *before* this step, nothing is logged, and
every request 502s, so it reads as a proxy bug rather than a hung process.

Redirecting from `/dev/null` supplies the EOF it is waiting for. That is the whole
reason the root `dev` script reads:

```
concurrently -k -n serve,apps "pnpm run serve < /dev/null" "turbo run dev"
```

Do not remove that `< /dev/null`. The `serve` script itself deliberately omits it, so
running `pnpm serve` on its own in a terminal keeps working stdin.

**Always go through `catalyst serve`.** It injects the Catalyst project headers that
`zcAuth.init(req)` parses. Hit the proxy, the web app on `:4000` or any app behind the
proxy directly and every Catalyst read fails with `app/invalid_project_details`. The
static parts still render, which makes it look like an app bug.

**The entry port is not 3000.** `catalyst serve` takes the first free port from 3000
upward, so it is usually 3001. Read the URL it prints. The proxy process itself listens
on whatever the CLI injects as `X_ZOHO_CATALYST_LISTEN_PORT` (4600 in practice); the
3000 in `apps/proxy/src/index.ts` is only a standalone fallback.

## Toolchain constraint

TypeScript is pinned to **5.9.x on purpose**. typescript-eslint hard-refuses TS 7
(`typescript-eslint does not support TS 7.0`), and that takes down `eslint-config-next`
with it, so on TS 7 no workspace can lint at all. Do not bump TypeScript to 7 until
typescript-eslint ships support.

**The editor must be pinned to that same TypeScript.** VS Code ships its own - 6.0.3 at the
time of writing - and will silently use it, so the editor and `pnpm typecheck` run different
compilers and disagree about code that builds and deploys fine. `.vscode/settings.json` sets
`typescript.tsdk` to `node_modules/typescript/lib` for exactly this reason; accept the
"use workspace version" prompt.

That drift has already bitten once. TypeScript 6 dropped the automatic injection of every
`@types` package found by walking `typeRoots` upward, so a `@types/node` declared only in the
root `package.json` stopped reaching the workspaces - `node:stream`, `process` and `console`
all went unresolved in a Node-only package under 6.0.3 while 5.9.3 stayed clean. Hence two
standing rules: every workspace that compiles Node code **declares `@types/node` itself** and
sets `"types": ["node"]` in its tsconfig (`packages/async-context`, `packages/logger`,
`packages/catalyst-node`, `packages/env`, `packages/input-validation`, `apps/proxy`,
`packages/testing`, and `packages/case-conversion` and `packages/http-client` for their tests
and Vitest config - not
`base.json`, which `packages/types` shares and which must stay framework-free). Note that
a package imported *by name* is unaffected: module resolution still walks up to the workspace
root. Only ambient type packages, which are never imported, need declaring.

`@types/node` tracks the Catalyst runtime, **not** the newest release: the proxy AppSail
declares `"stack": "node24"`, as every AppSail and function the skills add does, so it is
pinned to `^24.x` everywhere. Newer types describe APIs the
runtime does not have.

## Conventions

Topic rules live one-per-file in `.claude/rules/` and load automatically, one folder per scope.

`.claude/rules/general/` holds the rules for the whole repo:
- `catalyst-sdk.md` - every Catalyst call, and how few of them a solution makes.
- `catalyst-wrappers.md` - how a wrapper inside `packages/catalyst-node` is written; loads
  only there.
- `outbound-http.md` - every call to a service outside this repo.
- `logging.md` - every log line, and how each deployable injects `CatalystLogOutput` into the
  logger and flushes it on shutdown.
- `environment.md` - every environment variable.
- `zoho-token.md` - every Zoho access token, and the consent flow that grants one.
- `code-design.md` - every class, and the pattern it follows.
- `readable-code.md` - casing, naming, and when complexity is worth it.
- `testing.md` - where tests live, how Catalyst is faked, and what to run before calling a
  change done.
- `repositories.md` - where repositories live, why every table sits behind one, and whether
  an outside service is a repository or a client.
- `routing.md` - every app that serves HTTP, the web app's `WebPath` and a function's dev
  server included: its path constants, how routers mount, its proxy route, and when the
  paths move to `packages/routing`.

`.claude/rules/nextjs/` holds the rules that apply only to a Next.js app - `apps/web`, and a
second Slate app's `src/app/` and `src/components/` - each scoped with `paths:` frontmatter:
- `code-placement.md` - where server-side work in Next.js starts - a Server Component, a
  Server Action, a `route.ts` - and when it moves into an area or a package.
- `forms.md` - every form: react-hook-form, its resolver, and how it calls a Server Action
  and shows the result.
- `typography.md` - every font.
- `component-design.md` - how a component is split, styled and laid out, how it shows a
  wait, and asking before adding a confirm dialog to a button that changes data.

`.claude/rules/catalyst/` holds the rules every Catalyst function shares, and the kinds that
have no folder of their own - what goes inside each, how it is run locally, and its limits.
Creating one is a skill (below):
- `function-entry-point.md` - the export, init, scope and logger every function gets right.
- `advanced-io-function.md` - an Express app exported, never listening.
- `basic-io-function.md` - a single handler, arguments in, one string out.

`.claude/rules/node-api/` holds the rules for an Express app - an AppSail or an Advanced I/O
function. None ships today:
- `code-placement.md` - when to create an API app at all, what a route does, and when its
  work moves into an area (`src/<area>/<areas>.ts`) and when into a package.
- `express-app.md` - the app's layout, middleware order, scopes, input, errors, responses
  and bundle, and the plumbing the first one writes.

`.claude/rules/node-job/` holds the rules for a Job function:
- `job-function.md` - one function for every job, dispatching on `jobName`.
- `code-placement.md` - where a job's work goes, how it parses its params, and when it moves.

`.claude/rules/node-event/` holds the rules for a Signal (Event) function:
- `signal-function.md` - one function for every Signals event, dispatching on its name.
- `code-placement.md` - where an event's work goes, how it parses its data, and when it moves.

Every rule in `catalyst/` and `node-*/` is scoped with `paths:` frontmatter, so it loads only
once a workspace of its kind exists, from files only that kind has - a Job function's
`src/job-dispatcher.ts`, a Basic I/O function's `src/handler.ts`. Only the rules every
function shares, and the Advanced I/O rule, which has no file of its own, load from a
function's `catalyst-config.json`. Before then, the skill that creates one points to it.

Add a file to the folder it belongs to rather than growing this one. Give a rule `paths:`
frontmatter when it applies to only part of the tree.

- `@/*` resolves to `./src/*` in every app and every built package. Use it instead of `../../`.
- Shared packages expose subpaths, not a barrel: `@repo/types/user`,
  `@repo/case-conversion/camel-case`,
  `@repo/logger/logger`, `@repo/async-context/async-context`,
  `@repo/repositories/resources`, `@repo/zoho-token/zoho-connection`, `@repo/env/define-env`,
  `@repo/http-client/http-client`,
  `@repo/input-validation/input-validation`,
  `@repo/testing/vitest-projects`.
- File names are kebab-case: `http-error.ts`, `async-context.ts`.
- Identifiers and JSON keys are camelCase: `emailId`, `nextPageToken`. The exception is
  a wire shape a vendor defines - Catalyst sends `email_id`, `job_name`, `ROWID` - which
  is named as the vendor names it and converted at the wrapper, never leaked past it.
  See `.claude/rules/general/readable-code.md`.
- Workspace deps are `"workspace:*"`.
- **A file earns its existence from a second caller or from a boundary, not from
  tidiness.** Something used in exactly one place lives where it is used; split it out
  when the second caller arrives, and let that caller tell you what the shape should be.
  The exception is a seam - `apps/web/src/catalyst/`, `src/execution-context.ts` - which exists so
  that everything passes through one place. A seam is
  right at one caller, because being the only route through is its whole job. Everything
  else - a validation rule, a formatter, a resolver - is not.
- `packages/*` are ESM; the root, `apps/proxy` and an API app are CommonJS. The split is
  source-only - an AppSail or function's `scripts/bundle.mjs` builds with `format: "cjs"`,
  so esbuild inlines the ESM packages into one CommonJS file and the boundary never reaches
  the runtime.
- Unused-but-required params take a leading underscore (`_req`, `_next`); the lint rule
  is configured to allow exactly that.
- **No `any`, and `unknown` only where the type genuinely is not knowable yet** - a
  response body before it is parsed, a caught `error`, a value the SDK itself leaves
  untyped. Narrow it at the first point you can, and type the result. What this rules out
  is `any`/`unknown` standing in for a type nobody looked up: derive it from the signature
  that produces it, or declare it. `.claude/rules/general/catalyst-wrappers.md` shows how when
  the vendor types are awkward.

In `apps/web`:

- A page reads in its Server Component, wrapped in `withCatalystPage`; a form writes through
  a Server Action, wrapped in `withCatalystFn` (`src/execution-context.ts`). Both name the
  Catalyst scopes they read. No `fetch` anywhere in `src/` - ESLint bans it. See
  `.claude/rules/nextjs/code-placement.md`.
- Form state is react-hook-form, never re-implemented with `useState`. An action returns a
  rejected field as `{ ok: false, field, problem }`; the form puts it on the field and
  toasts anything else itself - see `.claude/rules/nextjs/forms.md`.
- Server-only configuration is read through `env` (`@/env`), never `process.env`.
- Fonts come from the tokens in `globals.css` and nowhere else. Never set a family on a
  component - see `.claude/rules/nextjs/typography.md`.

An API app, once there is one, is built as `.claude/rules/node-api/express-app.md` says -
its scopes, input, errors and responses. Its logging, outbound calls and environment
variables follow the `general/` rules like every other app.

## Adding to the repo

**An API for a caller outside the web app** - an API app, agreed with the user first:
`.claude/rules/node-api/code-placement.md` says which kind, `express-app.md` beside it how
the app is built, and `.claude/rules/general/routing.md` how its paths are named and
mounted. A `route.ts` in `apps/web` serves only the web app's own browser
(`.claude/rules/nextjs/code-placement.md`).

**A table** - declare its handle in `packages/repositories/src/resources.ts`, its
domain type in `packages/types`, and a repository in
`packages/repositories/src/<name>-repository.ts` that is the only importer of the
handle and maps rows to the domain type. Callers - a page, an action, a route - call the
repository. `ZohoConnectionRepository` is the worked example. See
`.claude/rules/general/repositories.md`.

**An AppSail, a function or a Slate app** - a new deployable, so agree it with the user
first, then pick the kind and run its skill in `.claude/skills/`. Whether an HTTP API is
worth one at all is `.claude/rules/node-api/code-placement.md`:

| You need | Add | Skill |
|---|---|---|
| an HTTP API that deploys and scales apart from the web app, each request under 30 s | an Advanced I/O function | `add-aio-fn` |
| one small operation, arguments in, one string out | a Basic I/O function | `add-bio-fn` |
| work a `Job` handle submits, now or at a set time | a Job function | `add-job-fn` |
| work a Catalyst Signals rule delivers | a Signal (Event) function | `add-signal-fn` |
| a process that runs past 15 minutes, holds WebSockets, or keeps state between requests | an AppSail, browser-facing or not | `add-appsail` |
| a second frontend on its own domain | a Slate app | `add-slate` |

Cron functions are deprecated and not used - run a job once, later, with `submitOneTimeCron` on
its `Job` handle, and on a schedule from a cron set up in the Console
(`.claude/rules/node-job/job-function.md`, "A recurring job"). A Job or Signal function stops at 15 minutes and a Basic I/O or Advanced
I/O function at 30 seconds; an AppSail has no timeout but is billed for uptime. The steps
all kinds share are in `.claude/skills/deployable-steps.md` and
`.claude/skills/function-steps.md`, which each skill reads first.

**A shared package** - `packages/<name>` with `"type": "module"`, the same subpath
`exports` block as the others, a `tsconfig.json` extending
`@repo/typescript-config/base.json` (no emit, covers `src` and `test`) and a
`tsconfig.build.json` extending it (`src` only, emits `dist/`), an `eslint.config.mjs`
spreading `@repo/eslint-config` - plus `allowTestsIn([...])` once it has tests - and the four
scripts - `build`, `dev`, `typecheck`, `lint` - with the devDependencies they run
(`@repo/eslint-config`, `@repo/typescript-config`, `concurrently`, `eslint`), copied from
`packages/async-context/package.json`. Turbo skips a workspace without a script, so a missing
`lint` or `typecheck` drops it from `pnpm verify` silently, and a missing `dev` leaves the apps
reading a stale `dist/`. A package the browser may import is
framework-free and sets `"types": []` - copy `packages/types` - or `@types/node` from the
repo root lets Node APIs compile in its `src/`. A server-only package declares `@types/node`
and `"types": ["node"]` instead - copy `packages/async-context`. `@repo/testing` is the one
exception to all of this - see `.claude/rules/general/testing.md`.

**Tests** - see `.claude/rules/general/testing.md`. Run `pnpm verify` before calling any change done.

## Catalyst notes

- `zcAuth.init(req)` (`@zcatalyst/auth`) is **per request**. Project details and caller
  credentials ride on request headers, so neither belongs in the environment. The SDK's own
  data-centre keys do, in each app's `.env` - `environment.md`, "The keys the Catalyst SDK
  reads".
- `catalyst_auth: true` in `apps/proxy/app-config.json` gates no page. It has
  `catalyst serve` pass Catalyst's sign-in paths (`/accounts`, `/oauthorize`) through to
  Catalyst, which the sign-in widget and sign-out need locally - do not remove it. Who sees
  which page is `apps/web/src/proxy.ts`, and each page, action or route names the scopes it
  reads, and one that needs a signed-in caller names User. Admin scope proves nothing about
  the caller: the gateway grants it to anonymous requests too, so an Admin-only route is
  public.
- `catalyst.json` declares the deployables and `.catalystrc` binds the project; both are
  gitignored and per-developer. `.catalystrc` comes from `catalyst init`; `catalyst.json` is
  written by hand from the block under "First run" in `README.md`, which is the copy kept in
  git - a new deployable adds its entry there too.
- An AppSail or function bundle is built with esbuild and strips `@repo/*` from the deployed
  manifest, so shared-package code is **inlined at bundle time**. Anything a package needs to
  resolve at runtime will work under `tsx watch` and fail once deployed.
- `apps/web/.catalyst/slate-config.toml` is CLI-generated. Do not hand-edit.
- Slate deploys `slate/web`, not `apps/web`. `apps/web/scripts/bundle.mjs` stages it with
  `@repo/*` vendored as `file:` dependencies, since Slate cannot resolve `workspace:*`.
- For platform questions use the installed skills (`catalyst-basics`, `catalyst-appsail`,
  `catalyst-slate`, `catalyst-datastore`, `catalyst-authentication`) rather than guessing.
