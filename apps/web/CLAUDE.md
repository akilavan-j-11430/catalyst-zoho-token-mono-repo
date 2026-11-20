@AGENTS.md

# apps/web

Next.js 16 / React 19 / Tailwind 4 frontend. Deployed as the Catalyst Slate app `web`.

Dev port: **4000** (`next dev -p 4000`).

## Where data comes from

This app serves its own reads and writes on the server; no API app ships. A page
reads in its Server Component, wrapped in `withCatalystPage`; a form writes through a Server
Action, wrapped in `withCatalystFn` (`src/execution-context.ts`). Both set the request's
Catalyst apps from Next's request headers, and the `@repo/catalyst-node` wrappers read them
from there:

```tsx
export default withCatalystPage([CatalystScope.User], async function HomePage() {
  const user = await UserManagement.currentUser();
  ...
});
```

`.claude/rules/nextjs/code-placement.md` is the full rule and loads automatically here - where
a page, an action or a route handler starts, and when its code moves.

Open the URL `catalyst serve` prints (first free port from 3000 up - often 3001), not
`:4000`. Catalyst reads the project details and the caller's credentials off the `x-zc-*`
headers `catalyst serve` adds, so a request made straight to `:4000` has no Catalyst app to
read with.

Whether Slate passes those same headers to Next's server is still unproven. "The first Slate
deploy" in `README.md` is the check, and names the fallback if it fails. A caller outside this
app - a mobile app, a webhook, another service - is served by an API app, not by a
`route.ts` here (`.claude/rules/node-api/code-placement.md`).

Shapes two workspaces use live in `@repo/types` (`@repo/types/user` for the user shapes) -
defined once, never redeclared here. Server-only configuration is on `src/env.ts`
(`TZ` and the Zoho OAuth keys), read through `env`; the browser reads no environment
variable. Sign-up's confirmation link and the Zoho redirect uri both point at the origin the
Server Action request came from (`src/request-url.ts`), so no URL is configured.

The Zoho connection is declared once in `src/zoho-connections.ts`. The home page reads it,
`connectZoho` and `disconnectZoho` sit beside that page, and `completeZohoConsent` beside
the `/zoho-token/callback` page Zoho returns to - `.claude/rules/general/zoho-token.md`.

## Who may see a page

The server decides, before any HTML is sent. `catalyst serve` stamps every local request
with `x-zc-user-type`, and `RequestSession.isSignedIn` (`src/catalyst/request-session.ts`)
reads it. That Slate stamps it too is still to be checked on the first Slate deploy
(`README.md`, "The first Slate deploy"):

- `src/proxy.ts` sends a signed-out visitor to `/sign-in` and a signed-in one away from
  `/sign-in` and `/sign-up` to `/`. Next runs it before any layout or page, on every
  request - a client-side navigation and a prefetch included - so a page never renders for
  the wrong visitor. Not a layout: a layout neither re-runs on a soft navigation nor stops
  its page from rendering (Next's `02-guides/authentication.md`, "Layouts and auth checks").
- Its `matcher` skips Next's assets and any path with an extension, since the sign-in widget
  loads `public/catalyst-signin.css` before anyone is signed in. A new public file needs
  nothing; a new signed-out page goes in its `SIGNED_OUT_PAGES`.
- Only `project-user` counts. An anonymous visitor may arrive as `admin` - the gateway grants
  Admin to anonymous requests - so a presence check could let everyone in.
- Never log or echo request headers from the proxy, a layout or a route handler. The same
  request carries Catalyst credentials in its other `x-zc-*` headers.
- The proxy reads a header and makes no Catalyst call, so it is not what protects data. Each
  page and action names its scopes, and a User scope with no signed-in user throws before
  the page or action runs - Next's "verify inside each Server Function", since an action is
  a POST the proxy's `matcher` could miss. The wrappers never redirect.

What the browser shows is display only. Data stays protected by the User scope each page and
action sets, since a wrapper can read only the apps its entry point set.

## Data fetching, forms and errors

Pages read in Server Components and forms write through Server Actions, so there is no
client data layer: no query library, no `fetch` - ESLint bans it everywhere in `src/`.
`react-hook-form` owns form state and `sonner` renders the toasts.
`.claude/rules/nextjs/forms.md` covers how a form validates, calls its action and reports
the result.

A Server Action returns a rejected field as `{ ok: false, field, problem }`, and the form
puts it on that field with `setError`. Anything else that fails is a toast the form raises
itself - Next shows the browser only a digest of a thrown error, so its message is never
shown. Success messages stay with the form too.

What belongs here is the toast, because it is styling rather than data flow.
`components/ui/sonner.tsx` is the vendored Toaster, at sonner's own top-center position and
`--width: 26rem`. Never move the stack to the middle of the page: it lands on the control
that raised it, and sonner draws only the front toast's content, so the ones behind show
as bare strips across the layout. **Its whole look lives in `globals.css`, not in the
component.** Sonner
sets `background` as a shorthand, which wipes out any `background-image` a utility class
adds, and styles `[data-icon]` three attributes deep - so Tailwind classes lose on
specificity whatever you do. Each rule there is one attribute wider than the one it
replaces, which is why it wins on specificity rather than on the load order of sonner's
runtime `<style>`. Read the note above that block before changing how a toast looks.

## Where components go

Three tiers under `src/components/`, and the split is about who owns the file:

```
src/components/ui/       shadcn primitives - vendored, regenerated by `shadcn add`
src/components/shared/   our own reusable pieces, no feature knowledge (loader, form-field)
src/components/auth/     components that know what signing in means
```

`ui/` is upstream code: it keeps shadcn's naming and is replaced wholesale on an
update, so nothing there should be hand-edited. Restyle through the tokens in
`globals.css` instead.

`shared/` is for pieces a second feature could use unchanged. A component that names
a domain concept does not belong here - it gets a folder beside `auth/`.

Non-component code stays out of `components/` **once it has a second caller or is a
seam**: `src/catalyst/auth-client.ts` is the only browser code that talks to the Catalyst
web SDK, `src/execution-context.ts` is the only way a page or an action reaches
Catalyst on the server, and `src/request-url.ts` is the server's way to this app's own origin,
which sign-up and the Zoho actions both need. What one component alone uses - a form's resolver, a formatter -
stays in that component until something else needs it. A Server Action sits beside the page
that uses it (`app/(auth)/sign-up/register-user.ts`). Routes stay thin and import from the
rest.

## Deployment

Slate does not deploy this directory. `pnpm bundle` runs `scripts/bundle.mjs`, which
stages a self-contained copy in `slate/web/` (gitignored), and `catalyst.json` points the
`web` Slate app there. Deployed from the repo root via `pnpm run deploy`.

Slate never runs turbo and cannot resolve `workspace:*`, so the staged copy is a plain
npm project:

- each `@repo/*` package the app reaches - directly, or through another one, as
  `@repo/catalyst-node` brings `@repo/async-context` - is copied from its built `dist/` into
  `vendor/<pkg>` and installed as `file:./vendor/<pkg>`;
- a vendored package's own third-party dependencies (`pino`, the `@zcatalyst/*` SDKs) are
  installed at the staged app's root, where Node finds them walking up from `vendor/`. Two
  packages asking for different versions of one dependency stop the script;
- each `workspace:*` devDependency (`@repo/eslint-config`) is dropped - npm refuses a
  manifest that names one - and with it `eslint.config.mjs` and the `lint` script, since
  `next build` never lints and the config would import the dropped package. `next build`
  does read `tsconfig.json`, so the script stops if a dropped package is named there (a
  tsconfig preset in `extends`) rather than ship a build that fails on Slate;
- `packageManager` is npm and a `package-lock.json` is generated beside it;
- the staged `.catalyst/slate-config.toml` is switched to `npm install` / `npm run build`.

`.catalyst/slate-config.toml` here is generated and managed by the Catalyst CLI - **do not
hand-edit it**; only the staged copy is rewritten. It applies to the first deployment
only, so the Slate app's build settings in the Console must say npm too.

A vendored package's manifest keeps only `name`, `version`, `type` and `exports`: its
dependencies are already the staged app's own.
`apps/web/turbo.json` makes `bundle` depend on `^build` alone - it needs the packages'
`dist/`, not a local `next build`.

## Notes

- `AGENTS.md` above is regenerated by `next dev`. Leave it in place and commit it with
  your work; it carries the Next.js 16 guidance that differs from older versions.
- Lint with `pnpm --filter web lint`, or `pnpm lint` for every workspace.
