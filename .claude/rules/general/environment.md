# Environment variables

`@repo/env` owns the mechanism, an app owns its keys. `defineEnv`
(`@repo/env/define-env`) is generic and names no variable; each app declares what it
reads in its own `src/env.ts` and exports the handle:

```ts
// apps/web/src/env.ts
import "server-only";
import { defineEnv } from "@repo/env/define-env";

type WebEnv = {
  /** Timezone for log timestamps. Falls back to the logger's own default. */
  TZ: string;
};

export const env = defineEnv<WebEnv>();
```

Two apps never share a key list, because two deployables are configured separately. The
template is the app's whole configuration surface, so what a deploy has to supply is one
file to read.

Read through the handle, never `process.env`. A typo is then a compile error rather than
an `undefined` at runtime:

```ts
import { env } from "@/env";

env.get("TZ");        // string - throws MissingEnvVariableError naming it when unset
env.optional("TZ");   // string | undefined - for a key with a fallback
```

`get` and `optional` both treat an empty value as unset, so a variable declared but left
blank fails the same way an absent one does.

## A Catalyst file never names an environment variable

Not `apps/*/app-config.json`, not `catalyst.json`, not
`apps/web/.catalyst/slate-config.toml`, not `.catalystrc`.

`app-config.json` is committed, so a value written there is a value committed to the
repository. `.env` is gitignored and is the only place a value lives; `.env.example` is
committed and carries the key with a comment and no value. Each deployable has its own pair,
`apps/<app>/.env` and `apps/<app>/.env.example`, and there is no shared root one: two
deployables are configured on two Console screens, so a value they both need is written in
both.

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
// packages/catalyst-node/src/user-management.ts
static async register(registration: {
  user: NewUser;
  redirectUrl: string;
}): Promise<RegisteredUser>

// apps/web/src/app/(auth)/sign-up/register-user.ts
const registered = await UserManagement.register({
  user,
  redirectUrl: await redirectUrl(),
});
```

Sign-up's redirect is not a key: the Server Action takes it from the request's own origin.
Were it one, the action would read it through its own `env`. It is the same rule as
`.claude/rules/general/catalyst-sdk.md` - a wrapper takes and returns plain values - and it is
what makes the failure land in the caller, which is what the variable configures.

`Logger` is the same shape from the other side: it holds the timezone in a static and
takes it through `Logger.configure({ timeZone })`, which the app calls once at startup with
its own `env.optional("TZ")`. The package formats; the app configures.

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

The platform injects these itself - Catalyst, or Next for `NEXT_RUNTIME` - and they are
read before any app template is in play. They stay as they are:

- an AppSail's `src/index.ts` - `X_ZOHO_CATALYST_LISTEN_PORT`, `PORT`, the port to listen on
- `packages/logger/src/catalyst-log-output.ts` - `X_ZOHO_SPARKLET_LOG_FD`, the log collector
  Catalyst hands a running app. The one read inside a package: no app configures it, and the
  class that writes SparkP packets to it is the only code that knows what it means.
- `apps/proxy/src/index.ts` - `X_ZOHO_CATALYST_LISTEN_PORT`, and the five SDK keys below, which
  it only prints

They are not configuration this repo owns, so they do not belong on a template. `apps/proxy`
has no `src/env.ts` for exactly that reason.

The project's details and the caller's credentials never go in the environment: they ride
on request headers, because `zcAuth.init(req)` is per request.

## The keys the Catalyst SDK reads

The SDK reads five keys of its own when it loads: `X_ZOHO_CATALYST_IS_LOCAL`,
`X_ZOHO_CATALYST_ACCOUNTS_URL`, `X_ZOHO_CATALYST_CONSOLE_URL`, `CATALYST_PORTAL_DOMAIN` and
`X_ZOHO_STRATUS_RESOURCE_SUFFIX`.

- **Not on a template.** No app code reads them, so they are not keys on `src/env.ts`; they
  go in the app's `.env.example`, with a comment, like any other key.
- **Their values come from `catalyst serve`**, which works them out from the project and data
  centre you signed in to and sets them for the one AppSail it runs, the proxy. The proxy
  prints them at startup, ready to paste; README "3. Fill in the environment" says how.
- **Anything turbo starts gets none** - the web app, an AppSail's or a function's dev
  server - so its `.env.example` lists all five and its `.env` holds the pasted values, all
  five even for the US: with `IS_LOCAL=true` the Stratus SDK reads `CATALYST_PORTAL_DOMAIN`
  with no US default.
- **Deployed, `IS_LOCAL` is never set.** The other four are set in the Console, until the
  first Slate deploy shows whether Slate sets them itself.

## `apps/web` reads its keys on the server

`apps/web`'s template, `src/env.ts`, is the one above: today only `TZ`. It imports
`server-only`, so only server code - a page, a Server Action, `server-logging.ts` - reads
it, through `env`, never `process.env`. The four steps above apply unchanged, with
`apps/web/turbo.json` passing the key through for `dev`.

- **The browser reads none.** There is no `NEXT_PUBLIC_*` key today: pages read and actions
  write on the server, so the browser needs no backend URL. A `NEXT_PUBLIC_*` value is
  inlined into the browser bundle at `next build`, so it would be public, and changing it
  would need a rebuild - add one only when the browser itself must know a value.
- Set the deployed values in **Console -> Slate -> web -> Environment Variables**.
  `scripts/bundle.mjs` never stages a `.env*` file, so a local value cannot ship.

## Not covered by this rule

`turbo.json`'s `globalPassThroughEnv` forwards variables to local tasks and keeps them out
of the cache key. It configures the build, not the runtime, and declaring a key there is
not declaring it to an app. It lists the SDK's keys above, so a value exported in the shell
still reaches every task, but an app normally gets them, like its own keys, by loading its
own `.env` - Next does for `apps/web`, and a Node app's `dev` script passes it to
`tsx --env-file-if-exists=.env`.

An app may carry its own `turbo.json` with `extends: ["//"]`, but a **global key is
root-only**: turbo 2.11 rejects `globalPassThroughEnv` there with `Found an unknown key`.
The per-app equivalent is task-level `passThroughEnv`, which is accepted and merges over
the inherited task definition. `apps/web/turbo.json` is that file: its `dev` task passes
through every key on the `src/env.ts` template and nothing else. The platform-injected
reads above are set only when Catalyst runs the app, never under turbo, so they have no
place there. `apps/proxy` has no turbo task that runs it, so it has none.
