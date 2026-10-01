# catalyst-zoho-token-mono-repo

The basic Catalyst monorepo plus a Zoho OAuth connection. pnpm workspaces + Turborepo.
Clone, run `catalyst init` to bind it to your own Catalyst project, then build.

Setup and troubleshooting are in `README.md` and not repeated here. This file covers
what the code does not tell you on its own.

## Role

You are a full-stack engineer on this Catalyst monorepo: Express 5 + the modular
`@zcatalyst/*` SDKs in `apps/api` (AppSail), Next.js 16 + React 19 in `apps/web`
(Slate), and a proxy that exists only for local development.

Never infer how a Catalyst service behaves by analogy to other cloud platforms -
load the relevant skill (`catalyst-datastore`, `catalyst-authentication`,
`catalyst-appsail`, `catalyst-slate`, `catalyst-basics`) or check the docs before
asserting it.

The repo carries exactly one feature: a Zoho OAuth connection, obtained once per
signed-in Catalyst user and never re-obtained. `/api/v1/zoho-token/{connect,callback,
status}` in `apps/api`, the refresh token in the `ZohoConnection` table, the access
token minted on demand and held in an in-memory LRU over Catalyst Cache. The
services are `packages/node-utils/src/services/zoho/`.

Everything else is still bare plumbing, so most other tasks mean adding the *first*
thing of their kind - the first bucket, the first job, the first shared model. Extend
the shape that is already here instead of introducing a second one; "Adding to the
repo" below is the checklist for each kind.

Where new work goes:

- HTTP routes, validation, Catalyst SDK calls -> `apps/api` (AppSail).
- Pages, components, styling -> `apps/web` (Slate).
- Shapes both sides use -> `packages/types`, defined once and imported by both;
  never two definitions that can drift.
- Route path segments -> `packages/routing`: `ApiPath` in `api-path.ts`, combined with
  `+` - `ApiPath.Api + ApiPath.V1`. `apps/api` mounts them and `apps/web` calls them, so
  a path is never a string literal in either app. Client paths belong here too, in their
  own file.
- Server-side helpers -> `packages/node-utils`. It imports `node:async_hooks`, so
  it is `apps/api` only - never reach it from `apps/web`.
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
   |-- /api/*  --> :8000  api   Express 5 + @zcatalyst/* SDKs    (AppSail)
   `-- /*      --> :4000  web   Next.js 16 + React 19           (Slate)
```

| Workspace | Package | Deploy target |
|---|---|---|
| `apps/proxy` | `proxy` | **none - local only** |
| `apps/api` | `api` | AppSail `api` |
| `apps/web` | `web` | Slate `web` |
| `packages/types` | `@repo/types` | - |
| `packages/routing` | `@repo/routing` | - |
| `packages/node-utils` | `@repo/node-utils` | - |
| `packages/typescript-config` | `@repo/typescript-config` | - |
| `packages/eslint-config` | `@repo/eslint-config` | - |

**The proxy is never deployed.** It exists only to give local development the single
origin and auth gate that Catalyst provides natively in the cloud. It appears in
`catalyst.json` so `catalyst serve` can run it, and `pnpm deploy` deliberately ships
only `appsail:api` and `slate:web`. Do not add it to the deploy list.

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
`zcAuth.init(req)` parses. Hit the proxy or the API directly and every `/api`
request fails with `app/invalid_project_details`, rendered as a generic 500. The
frontend still works, which makes it look like an API bug.

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
all went unresolved in `packages/node-utils` under 6.0.3 while 5.9.3 stayed clean. Hence two
standing rules: every workspace that compiles Node code **declares `@types/node` itself** and
sets `"types": ["node"]` in its tsconfig (`packages/node-utils`, `apps/api`, `apps/proxy` -
not `base.json`, which `packages/types` shares and which must stay framework-free). Note that
a package imported *by name* is unaffected: module resolution still walks up to the workspace
root. Only ambient type packages, which are never imported, need declaring.

`@types/node` tracks the AppSail runtime, **not** the newest release: both AppSails declare
`"stack": "node24"`, so it is pinned to `^24.x` everywhere. Newer types describe APIs the
runtime does not have.

## Conventions

Topic rules live one-per-file in `.claude/rules/` and load automatically: `catalyst-sdk.md`
covers every Catalyst call, `outbound-http.md` every call to a service outside this repo,
`web-data-access.md` every call the browser makes to our own API and every form that
collects one, `environment.md` every environment variable, `typography.md` every font.
Add a file there rather than growing this one, and give it `paths:` frontmatter if it only
applies to part of the tree.

- `@/*` resolves to `./src/*` in every workspace. Use it instead of `../../`.
- Shared packages expose subpaths, not a barrel: `@repo/types/api`, `@repo/routing/api-path`,
  `@repo/node-utils/framework/logger`, `@repo/node-utils/framework/async-context`,
  `@repo/node-utils/services/catalyst/resources`, `@repo/node-utils/utils/env`.
- File names are kebab-case: `http-error.ts`, `async-context.ts`.
- Identifiers and JSON keys are camelCase: `emailId`, `nextPageToken`. The exception is
  a wire shape a vendor defines - Catalyst sends `email_id`, `job_name`, `ROWID` - which
  is named as the vendor names it and converted at the wrapper, never leaked past it.
- Workspace deps are `"workspace:*"`.
- **A file earns its existence from a second caller or from a boundary, not from
  tidiness.** Something used in exactly one place lives where it is used; split it out
  when the second caller arrives, and let that caller tell you what the shape should be.
  The exception is a seam - `services/catalyst/`, `services/api/client.ts`,
  `endpoints.ts` - which exists so that everything passes through one place. A seam is
  right at one caller, because being the only route through is its whole job. Everything
  else - a validation rule, a formatter, a resolver - is not.
- `packages/*` are ESM; root and `apps/api` are CommonJS. The split is source-only -
  `scripts/bundle.mjs` builds with `format: "cjs"`, so esbuild inlines the ESM
  packages into one CommonJS file and the boundary never reaches the runtime.
- Unused-but-required params take a leading underscore (`_req`, `_next`); the lint rule
  is configured to allow exactly that.
- **No `any`, and `unknown` only where the type genuinely is not knowable yet** - a
  response body before it is parsed, a caught `error`, a value the SDK itself leaves
  untyped. Narrow it at the first point you can, and type the result. What this rules out
  is `any`/`unknown` standing in for a type nobody looked up: derive it from the signature
  that produces it, or declare it. `.claude/rules/catalyst-sdk.md` shows how when the
  vendor types are awkward.

In `apps/web`:

- Reach `apps/api` through `src/services/` - one file per domain, built on
  `src/services/api/` (`client.ts` for transport, `endpoints.ts` for every path). No
  `fetch` and no URL in a component.
- Server state is react-query, form state is react-hook-form. Both are installed; neither
  gets re-implemented with `useState`.
- Failures are reported by the query client as a toast, so a call site handles success only.
- The full rule is `.claude/rules/web-data-access.md`.
- Fonts come from the tokens in `globals.css` and nowhere else. Never set a family on a
  component - see `.claude/rules/typography.md`.

In `apps/api`:

- Reach Catalyst through a resource handle imported from
  `@repo/node-utils/services/catalyst/resources`, where every table, bucket, cache segment
  and job is declared once with the wrapper's `create` factory. Never construct a wrapper
  in a handler, never initialize Catalyst yourself, and never read the app off the context
  - see `.claude/rules/catalyst-sdk.md`.
- Throw `HttpError.BadRequest | Unauthorized | NotFound | Conflict`
  (`src/errors/http-error.ts`) instead of setting a status by hand. `errorHandler`
  maps them; anything else becomes a 500.
- Build every response with `toRecordResponse`, `toPagedResponse`, or
  `toErrorResponse` (`src/utils/api.ts`) so payloads share one envelope.
- Log through `logger` from `@repo/node-utils/framework/logger`, not `console`.
- Call external services through `HttpClient` (`@repo/node-utils/http/http-client`), never
  `fetch` or another client directly. It stamps the request's execution id on every
  outbound call as `app-execution-id`. See `.claude/rules/outbound-http.md`.
- Read environment variables through `env` (`@/env`), never `process.env`. This app owns
  its keys - add one to the template in `src/env.ts` first, so a typo is a compile error.
  Values live in `.env`, never in `app-config.json` or any other Catalyst file, and
  nothing Catalyst-related belongs in the environment at all. The platform-injected reads
  at module scope in `index.ts` and `framework/catalyst-logger.ts` are the exception.
  See `.claude/rules/environment.md`.

## Adding to the repo

**An API route** - follow `src/routes/ping.ts`: export a `Router` with the explicit
`: Router` annotation, use the response builders, add its segments to `ApiPath`
(`packages/routing`), then mount it in `src/routes/api-router.ts` under its own segment.
That file is the only place a router mounts, so `src/index.ts` never changes.

**An AppSail app** - copy `apps/api` as the shape. Four things must agree:
`scripts/bundle.mjs` (output `appsails/<name>/`), `app-config.json`, the `catalyst.json`
entry, and the `--only appsail:<name>` flag in the root `deploy` script.

**A shared package** - `packages/<name>` with `"type": "module"`, the same subpath
`exports` block as the others, a tsconfig extending `@repo/typescript-config/base.json`,
`"build": "tsc --build && tsc-alias"`, and an `eslint.config.mjs` re-exporting
`@repo/eslint-config`. Keep it framework-free: both Express and Next.js consume these.

## Catalyst notes

- `zcAuth.init(req)` (`@zcatalyst/auth`) is **per request**. Project details and caller
  credentials ride on request headers, so nothing Catalyst-related belongs in the
  environment.
- `catalyst_auth: true` in `apps/proxy/app-config.json` is what enforces login locally.
  The api AppSail does not set it - it is reachable only through the proxy.
- `catalyst.json` is committed and declares the deployables. `.catalystrc` is gitignored
  and per-developer, written by `catalyst init`.
- `apps/api` bundles with esbuild and strips `@repo/*` from the deployed manifest, so
  shared-package code is **inlined at bundle time**. Anything a package needs to resolve
  at runtime will work under `tsx watch` and fail in AppSail.
- `apps/web/.catalyst/slate-config.toml` is CLI-generated. Do not hand-edit.
- For platform questions use the installed skills (`catalyst-basics`, `catalyst-appsail`,
  `catalyst-slate`, `catalyst-datastore`, `catalyst-authentication`) rather than guessing.
