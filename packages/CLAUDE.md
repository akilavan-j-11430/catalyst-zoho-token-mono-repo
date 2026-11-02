# packages/

Shared code for the monorepo. All six are private and consumed as `"workspace:*"`.

| Package | Holds |
|---|---|
| `@repo/routing` | API path segments (`ApiPath`) shared by `apps/api` and `apps/web` |
| `@repo/case-conversion` | `CamelCase` - renames a vendor's snake_case/kebab-case keys, for `node-utils` and `apps/web` |
| `@repo/types` | API response shapes shared by `apps/api` and `apps/web` |
| `@repo/node-utils` | `ExecutionContext`, `logger`, `env`, `RuntimeError`, `HttpClient`, `PLimit`, `PLimitPerKey`, the Catalyst wrappers (`table`, `bucket`, `cache`, `job`, `zcql`, `user-management`) plus the resource handles built from them, the table repositories (`ZohoConnectionRepository`), and the Zoho connection (`services/zoho/`) |
| `@repo/typescript-config` | `base.json` that every tsconfig extends |
| `@repo/eslint-config` | flat ESLint config: the import boundaries and the camelCase naming rule |

## Import paths

`@repo/types`, `@repo/routing`, `@repo/case-conversion` and `@repo/node-utils` expose **subpaths**, not a barrel. The `exports`
block maps `./*` onto `./dist/*.js` + `./dist/*.d.ts`, so the import path mirrors the
path under `src/`:

```ts
import type { RecordResponse } from "@repo/types/api";              // src/api.ts
import { logger } from "@repo/node-utils/framework/logger";         // src/framework/logger.ts
import { currentContext } from "@repo/node-utils/framework/async-context";
import { zohoConnectionCache } from "@repo/node-utils/catalyst/resources"; // src/catalyst/resources.ts
import { defineEnv } from "@repo/node-utils/utils/env";               // src/utils/env.ts
```

There is no `@repo/types` root import. Adding a file under `src/` is enough to publish
a new subpath - no `exports` edit needed.

## Building

Both code packages are ESM (`"type": "module"`) and build with
`tsc --build && tsc-alias`; `tsc-alias` is what rewrites the internal `@/*` alias in
the emitted JS. `pnpm dev` at the root runs them in watch mode, so app changes pick up
package edits without a manual rebuild.

Consumers must be built after these. Turborepo handles that via `dependsOn: ["^build"]`.

## Rules

- **Keep them framework-free.** Both an Express app and a Next.js app import these.
  No `express`, no `react`, no Next.js imports.
- **`node-utils/src/catalyst/` is the only directory that may import a Catalyst
  SDK.** ESLint enforces it. See `.claude/rules/catalyst-sdk.md`.
- **Catalyst resources are declared once, in `catalyst/resources.ts`** - one
  `export const` per table, bucket, cache segment and job, built with the wrapper's
  `create` factory. Apps import the handle; they never construct a wrapper themselves.
  It sits here rather than in an app so two AppSails cannot name the same table twice.
- **A capability an app lacks becomes a method on the wrapper**, never an SDK call at the
  call site. `catalyst/` is meant to be the whole list of what this repo asks of
  Catalyst, so anything used from a route has to be visible there.
- Node-only APIs (`node:async_hooks`, `fs`) belong in `node-utils` and must never be
  reached from `apps/web`.
- `apps/api` bundles with esbuild and strips `@repo/*` from the deployed manifest, so
  package code is **inlined at bundle time**. Anything that needs to resolve at runtime
  - a file read relative to the package, a native module - will break in AppSail.
- kebab-case file names, `@/*` for internal imports.
- `HttpClient` (`src/http/`) is the only way anything in this repo talks to an external
  service. Types live in `src/types/`, named constants in `src/enums/`, and the transport
  seam is `src/types/http.ts` - see `.claude/rules/outbound-http.md` before adding an HTTP
  dependency.
- **These packages own the env mechanism, never a key.** `src/utils/env.ts` exports
  `defineEnv<T>()`, which is generic and names no variable; each app declares what it
  reads in its own `src/env.ts`. A package that needs a configured value **takes it as a
  parameter** - `UserManagement.register(user, redirectUrl)`, `setLogTimeZone(zone)`,
  `ZohoConnection.create(credentials, grant)` - so
  the app that owns the variable is the one that reads it, and the failure lands where the
  value is used. No file under `packages/` calls `process.env` except the mechanism
  itself. See `.claude/rules/environment.md`.

## A new package

`packages/<name>` with: `"private": true`, `"type": "module"`, the same `exports`
block, a tsconfig extending `@repo/typescript-config/base.json` with
`outDir: ./dist` / `rootDir: ./src` / the `@/*` path, and
`"build": "tsc --build && tsc-alias"`. Then add it to consumers as `"workspace:*"`.
