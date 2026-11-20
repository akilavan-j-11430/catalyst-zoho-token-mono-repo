# packages/

Shared code for the monorepo. All eleven are private and consumed as `"workspace:*"`.

| Package | Holds |
|---|---|
| `@repo/case-conversion` | `CamelCase` - renames a vendor's snake_case/kebab-case keys, for `catalyst-node`; framework-free, so `apps/web` may use it too |
| `@repo/types` | Shapes two workspaces use - `user` for the user shapes, `http` for the HTTP response `HttpClient` returns |
| `@repo/http-client` | `HttpClient` - every call to a service outside this repo. Framework-free and browser-safe: it reads nothing ambient, and the caller passes in what a call carries |
| `@repo/catalyst-node` | `CatalystSession` and the Catalyst wrappers (`table`, `bucket`, `cache`, `job`, `zcql`, `user-management`) - every Catalyst SDK call, on the server. It names no resource of this solution; the handles live in `@repo/repositories` |
| `@repo/env` | `defineEnv` - reads one app's declared environment variables; throws `MissingEnvVariableError` for an unset one |
| `@repo/async-context` | `ExecutionContext`, `currentContext`, `runWithContext` and `AsyncContextError` - the execution id and extras of the request in flight. Node only |
| `@repo/logger` | `Logger` on pino - `Logger.for(source)`, one block per line stamped with the request's execution id and order. Node only, since it reads `@repo/async-context` |
| `@repo/input-validation` | `InputValidation.parse(schema, input)` - checks input from outside the app against a zod schema and throws `InvalidInputError` naming the field. Knows nothing about HTTP; framework-free, so the browser may use it too |
| `@repo/typescript-config` | `base.json` that every tsconfig extends |
| `@repo/eslint-config` | flat ESLint config: the import boundaries and the camelCase naming rule |
| `@repo/testing` | `VitestProjects` - the shared Vitest settings; later, any test fake a second workspace needs. Dev-only, never imported from `src/` |

## Import paths

`@repo/types`, `@repo/case-conversion`, `@repo/http-client`, `@repo/catalyst-node`, `@repo/env`, `@repo/async-context` and `@repo/logger` expose **subpaths**, not a barrel. The `exports`
block maps `./*` onto `./dist/*.js` + `./dist/*.d.ts`, so the import path mirrors the
path under `src/`:

```ts
import type { NewUser } from "@repo/types/user";                   // src/user.ts
import { Logger } from "@repo/logger/logger";                      // src/logger.ts
import { currentContext } from "@repo/async-context/async-context";
import { invoiceBucket } from "@repo/repositories/resources";     // src/resources.ts
import { defineEnv } from "@repo/env/define-env";                  // src/define-env.ts
```

There is no `@repo/types` root import. Adding a file under `src/` is enough to publish
a new subpath - no `exports` edit needed.

## Building

The code packages are ESM (`"type": "module"`) and build with
`tsc --build tsconfig.build.json && tsc-alias -p tsconfig.build.json`; `tsc-alias` is what
rewrites the internal `@/*` alias in the emitted JS. Each - all but `@repo/testing`, which
has no build - has two tsconfigs:
`tsconfig.json` covers `src/`, `test/` and `vitest.config.ts` and never emits - the editor
and `pnpm typecheck` use it - and `tsconfig.build.json` extends it with `src/` only. Tests
live in `test/`. Lint rejects one under `src/`, so `pnpm verify` fails before it ships, but
lint does not gate `build` or `dev`: until it is moved, `tsc` still compiles it into
`dist/`. `pnpm dev` at the root runs them in watch mode, so app changes pick up package
edits without a manual rebuild.

Consumers must be built after these. Turborepo handles that via `dependsOn: ["^build"]`.

## Rules

- **Keep them framework-free.** The Next.js app, the functions and any AppSail import these.
  No `express`, no `react`, no Next.js imports. The one exception arrives with a second app
  that serves HTTP: its Express plumbing then moves into `packages/http-server`, the one
  package allowed `express` - see `.claude/rules/node-api/express-app.md`.
- **`packages/catalyst-node` is the only package that may import a Catalyst
  SDK.** ESLint enforces it. See `.claude/rules/general/catalyst-sdk.md`.
- **Catalyst resources are declared once, in `repositories/src/resources.ts`** - one
  `export const` per table, bucket, cache segment and job, built with the wrapper's
  `create` factory. A table's handle is imported only by its repository; a bucket, cache or
  job handle by whatever needs it. Nothing constructs a wrapper anywhere else.
  It sits in this package rather than in an app, so two deployables cannot name the same
  table twice, and rather than in `catalyst-node`, which wraps the SDK for any solution.
  `packages/repositories` arrives with the first resource.
- **A capability an app lacks becomes a method on the wrapper**, never an SDK call at the
  call site. `packages/catalyst-node/src/` is meant to be the whole list of what this repo asks of
  Catalyst, so anything used from a route has to be visible there.
- Node-only APIs (`node:async_hooks`, `fs`) belong in a server-only package -
  `async-context`, `logger`, `catalyst-node`. In `apps/web` only server code - a page, a
  Server Action, a file that imports `server-only` - may reach one, never a client
  component.
- An AppSail or function bundle is built with esbuild and strips `@repo/*` from the deployed
  manifest, so package code is **inlined at bundle time**. Anything that needs to resolve at
  runtime - a file read relative to the package, a native module - breaks once deployed.
- kebab-case file names, `@/*` for internal imports.
- `HttpClient` (`@repo/http-client`) is the only way anything in this repo talks to an
  external service. The transport seam is its `src/http-types.ts` - see
  `.claude/rules/general/outbound-http.md` before adding an HTTP dependency. It sets
  `"types": []` in `tsconfig.build.json`, so a Node API in its `src/` fails the build and it
  stays usable from the browser.
- **These packages own the env mechanism, never a key.** `@repo/env` exports
  `defineEnv<T>()`, which is generic and names no variable; each app declares what it
  reads in its own `src/env.ts`. A package that needs a configured value **takes it as a
  parameter** - `UserManagement.register({ user, redirectUrl })`, `Logger.configure({ timeZone })` - so
  the app that owns the variable is the one that reads it, and the failure lands where the
  value is used. No file under `packages/` calls `process.env` except the mechanism
  itself and `logger`'s `catalyst-log-output.ts`, which reads the log collector Catalyst
  hands the process - a platform value no app configures. See
  `.claude/rules/general/environment.md`.

## A new package

`packages/<name>` with: `"private": true`, `"type": "module"`, the same `exports`
block, a `tsconfig.json` extending `@repo/typescript-config/base.json` with `noEmit`, the
`@/*` path and `include: ["src", "test", "vitest.config.ts"]`, a `tsconfig.build.json`
extending it with `noEmit: false` / `rootDir: ./src` / `outDir: ./dist` /
`include: ["src"]`, and the
four scripts - `build`, `dev`, `typecheck`, `lint` - and the devDependencies they run
(`@repo/eslint-config`, `@repo/typescript-config`, `concurrently`, `eslint`), copied from
`packages/async-context/package.json`. Turbo skips a workspace without a script, so a missing
`lint` or `typecheck` drops it from `pnpm verify` silently, and a missing `dev` leaves the apps
reading a stale `dist/`. Then add it to consumers as `"workspace:*"`. `@repo/testing` is the exception: it exports its
TypeScript sources and has no build - see `.claude/rules/general/testing.md`.

A package the browser may import is framework-free, so it also sets `"types": []`: in
`tsconfig.json`, or in `tsconfig.build.json` only once it has tests that need Node types.
Without it TypeScript picks up `@types/node` from the repo root, and `process.env` in `src/`
compiles. `packages/types` is the template to copy.
