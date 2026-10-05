# Environment variables

`node-utils` owns the mechanism, an app owns its keys. `defineEnv`
(`@repo/node-utils/utils/env`) is generic and names no variable; each app declares what it
reads in its own `src/env.ts` and exports the handle:

```ts
// apps/api/src/env.ts
import { defineEnv } from "@repo/node-utils/utils/env";

type ApiEnv = {
  /** Where Catalyst sends a new user from the confirmation email. */
  AUTH_REDIRECT_URL: string;
  /** Timezone for log timestamps. */
  TZ: string;
  // ... and one entry per Zoho OAuth key; see the real file for the full list.
};

export const env = defineEnv<ApiEnv>();
```

Two apps never share a key list, because two AppSails are configured separately. The
template is the app's whole configuration surface, so what a deploy has to supply is one
file to read.

Read through the handle, never `process.env`. A typo is then a compile error rather than
an `undefined` at runtime:

```ts
import { env } from "@/env";

env.get("AUTH_REDIRECT_URL");   // string - throws RuntimeError naming it when unset
env.optional("TZ");             // string | undefined - for a key with a fallback
```

`get` and `optional` both treat an empty value as unset, so a variable declared but left
blank fails the same way an absent one does.

## A Catalyst file never names an environment variable

Not `apps/*/app-config.json`, not `catalyst.json`, not
`apps/web/.catalyst/slate-config.toml`, not `.catalystrc`.

`app-config.json` is committed, so a value written there is a value committed to the
repository. `.env` is gitignored and is the only place a value lives; `.env.example` is
committed and carries the key with a comment and no value. The root pair holds what every
app shares; an app's own keys go in `apps/<app>/.env` and `apps/<app>/.env.example`.

This costs something at deploy time and the cost is worth knowing. For an app linked in
`catalyst.json`, `env_variables` in `app-config.json` is what the AppSail runtime applies
on every deploy. With the key gone, the repo supplies nothing, and the deployed values are
set in **Console -> AppSail -> <app> -> Configuration -> Environment Variables**. That is
the trade: a secret can never reach git, and the Console is the system of record for what
production runs.

## A shared package never reads an app's configuration

A package under `packages/` has no keys of its own and no `src/env.ts`. It takes what it
needs as a parameter, so the app that owns the variable is the one that reads it:

```ts
// packages/node-utils/src/services/catalyst/user-management.ts
static async register(user: NewUser, redirectUrl: string): Promise<RegisteredUser>

// apps/api/src/routes/auth.ts
await UserManagement.register(user, env.get("AUTH_REDIRECT_URL"));
```

It is the same rule as `.claude/rules/catalyst-sdk.md` - a wrapper takes and returns plain
values - and it is what makes the failure land in the route, which is what the variable
configures.

`logger` is the same shape from the other side: it holds the timezone in a module-level
static and exposes `setLogTimeZone`, which the app calls once at startup with its own
`env.optional("TZ")`. The package formats; the app configures.

## Adding a variable

Four steps, in order:

1. The key on the app's template in `apps/<app>/src/env.ts`, with a comment saying what it
   is for.
2. The key in the `dev` task's `passThroughEnv` in `apps/<app>/turbo.json`, so a value set
   in the shell survives turbo's strict env mode.
3. An entry in `apps/<app>/.env.example` - committed, commented, no value.
4. The local value in `apps/<app>/.env` - gitignored.

Then set it in the Catalyst Console before the next deploy that needs it.

## The platform-injected reads

Catalyst injects these itself and they are read at module scope, before any app template
exists. They stay as they are:

- `apps/api/src/index.ts` - `X_ZOHO_CATALYST_LISTEN_PORT`, `PORT`
- `apps/api/src/framework/catalyst-logger.ts` - `X_ZOHO_SPARKLET_LOG_FD`
- `apps/proxy/src/index.ts` - `X_ZOHO_CATALYST_LISTEN_PORT`

They are not configuration this repo owns, so they do not belong on a template. `apps/proxy`
has no `src/env.ts` for exactly that reason.

Nothing Catalyst-related belongs in the environment at all. Project details and the
caller's credentials ride on request headers, because `zcAuth.init(req)` is per request.

## Not covered by this rule

`apps/web` reads no environment at all - no `process.env`, no `NEXT_PUBLIC_*`. Anything the
browser needs comes from the API.

`turbo.json`'s `globalPassThroughEnv` forwards variables to local tasks and keeps them out
of the cache key. It configures the build, not the runtime, and declaring a key there is
not declaring it to an app. It lists the platform values the Catalyst CLI and SDK read,
not this repo's own keys, which reach `apps/api` because its `dev` script loads `.env`
directly through `tsx --env-file-if-exists`.

An app may carry its own `turbo.json` with `extends: ["//"]`, but a **global key is
root-only**: turbo 2.11 rejects `globalPassThroughEnv` there with `Found an unknown key`.
The per-app equivalent is task-level `passThroughEnv`, which is accepted and merges over
the inherited task definition. `apps/api/turbo.json` is that file: its `dev` task passes
through every key on the `src/env.ts` template and nothing else. The platform-injected
reads above are set only when Catalyst runs the app, never under turbo, so they have no
place there.
`apps/web` reads no environment and `apps/proxy` has no turbo task that runs it, so
neither has one.
