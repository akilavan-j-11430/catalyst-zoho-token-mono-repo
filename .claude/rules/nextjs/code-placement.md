---
paths:
  - "apps/web/**"
  - "apps/*/next.config.ts"
  - "apps/*/src/app/**"
  - "apps/*/src/components/**"
---

# Where code goes in apps/web

Next.js runs code in two places - the server (Server Components, Server Actions, route
handlers) and the browser - and this rule says where each piece of server-side work starts
and when it moves. Code starts as small as it can and moves only when a real caller asks
for it, the same rule as "a file earns its existence from a second caller" in the root
`CLAUDE.md`.

A page reads in its Server Component, a form writes through a Server Action, and a
`route.ts` serves what the app's own browser cannot get from either. This rule is for every
one of them. A caller outside the app - a mobile app, a webhook, another service - is served
by an API app instead, with its own Express middleware (`node-api/code-placement.md`).

## Built, and not yet

Built: `src/execution-context.ts` (`withCatalystPage`, `withCatalystFn`, below), the
`server-only` package, and the server packages as dependencies of `apps/web` - which
`scripts/bundle.mjs` vendors along with their own third-party dependencies (`CLAUDE.md`,
"Deployment").

Not built yet: an ESLint rule that stops a client component importing a server file or a
Node-only package. Until it exists, `import "server-only"` at the top of every server file is
the guard - a client component that reaches one fails `next build`.

Still unproven, and checked on the first Slate deploy: whether Slate's Next.js server
receives the `x-zc-*` credential headers, a signed-in user's included. Locally
`catalyst serve` sends them.

## Where it starts

| You need | It starts in |
|---|---|
| a page that shows data | the page's Server Component, wrapped in `withCatalystPage`, reading during render - no API call, no client loading state for it |
| a form that changes data | a Server Action - a `"use server"` file beside its page, wrapped in `withCatalystFn`: `app/(auth)/sign-up/register-user.ts` |
| an endpoint the app's own browser calls - a streamed file, a polled read | `app/api/.../route.ts`, its handler written in the `GET` / `POST` export and wrapped in `withCatalystFn`, which passes on Next's `{ params }` |
| data | a repository in `@repo/repositories`, or a bucket, cache or job handle from `@repo/catalyst-node/resources` - each reads the request's app from the execution context. List every scope they read: a repository method's own (`general/repositories.md`), and Admin for a cache or job handle, which are admin-only. Never a table handle, ZCQL or an SDK call in `apps/web` |

A Server Action and a route handler are both plain async functions - no wrapper of our own
besides `withCatalystFn`. Use an action for a write from our own pages, and a route
handler only for a parallel or polled read or a streamed file. `withCatalystFn` throws
when a scope cannot be set, which suits the app's own pages; a caller outside the app needs
a 401, which an API app's `initCatalystScopes` answers.

A path the app writes - a redirect, a link, a sign-out target - is a `WebPath` constant from
`src/web-path.ts`, never a string literal (`general/routing.md`, "A Next.js app").

## The execution context

Each entry point starts one execution context, so its log lines share one Execution ID and
the Catalyst wrappers find the request's apps on it. Next.js has no middleware chain to do
that, so `src/execution-context.ts` wraps each entry point instead:

| Entry point | Wrapper |
|---|---|
| a page | `withCatalystPage(scopes, page)` |
| a Server Action, a route handler | `withCatalystFn(scopes, call)` |

Both start the context, set the app for each listed scope from Next's request headers with
`CatalystSession.setApp`, in order, then run the function inside it. A scope that cannot be
set - User, with no signed-in user - throws `SCOPE_UNAVAILABLE` before the function runs, and
the wrappers decide nothing more: `src/proxy.ts` has already sent a signed-out visitor to
`/sign-in`, so a failure here is a real error and shows the error page. Every
`@repo/catalyst-node` wrapper reads its app with `CatalystSession.app(scope)`, so nothing
passes a session along.

**Only the page's own body runs inside the context.** React renders the components a page
returns later, outside it, so a component below the page cannot read Catalyst. The page
reads, and passes what it read down as props.

```tsx
// app/(app)/page.tsx
export default withCatalystPage([CatalystScope.User], async function HomePage() {
  const user = await UserManagement.currentUser();
  return <SignedInAccount user={user} />;
});
```

```ts
// app/(auth)/sign-up/register-user.ts
"use server";

export const registerUser = withCatalystFn(
  [CatalystScope.Admin],
  async (input: unknown): Promise<RegisterResult> => {
    try {
      const user: NewUser = InputValidation.parse(newUserSchema, input);
      const registered = await UserManagement.register({
        user,
        redirectUrl: await RequestUrl.absolute(WebPath.Home),   // this app's origin, from the request
      });
      return { ok: true, registered };
    } catch (error) {
      if (error instanceof InvalidInputError) {
        return { ok: false, field: error.field, problem: error.problem };
      }
      throw error;
    }
  },
);
```

`src/proxy.ts` turns a signed-out visitor away with the cheap `RequestSession.isSignedIn`
check before anything renders - never a layout, which neither re-runs on a client-side
navigation nor stops its page from rendering. It only redirects; each page and action names
its own scopes as well, and that is what protects the data.

`@repo/logger` gets `CatalystLogOutput` in `src/server-logging.ts`, which `execution-context.ts`
imports - `general/logging.md` says why there and not in `instrumentation.ts`.

## When it moves

Each move is made when its trigger happens, never in advance:

| When | Move it to |
|---|---|
| a second place in the app needs the same operation, or the same access check | `src/<area>/<areas>.ts` - `src/account/accounts.ts`, class `Accounts` - and both callers use it |
| a second form or endpoint needs the same input rules | `src/<area>/<area>-validation.ts` |
| a second area needs a component | the root `src/components/` |
| another deployable needs the operation - a job, a Signal function, an AppSail | a package, `packages/<area>` (`@repo/accounts`), that the web app and the deployable both import. Nothing imports from an app |
| an area file passes ~300 lines, or holds groups that have nothing to do with each other | one file per group - `account-members.ts`, `account-billing.ts` - and a subfolder per group (`account/members/`) once a group itself grows |

## An area

```
src/account/
  accounts.ts             Accounts - what the app does with accounts, on the server
  account-validation.ts   the input schemas, shared by the form and the server
  components/             the account screens
```

- **Named after the business.** `account/`, `invoice/`, `patient/` - straight under `src/`,
  with no `features/` or `domains/` folder around them.
- **No pattern or framework words in a name.** `Accounts`, not `AccountService`;
  `account-validation.ts`, not `-schema.ts`; no `-controller`, no `-actions`.
- **An area uses another only through its `<areas>.ts`** - never its components or its
  Server Actions. An operation that belongs to two areas lives in the one that owns the
  data it changes.

## A Server Action

Every exported function of a `"use server"` file is a public POST endpoint - Next gives it
a hidden id and the browser calls it with a POST - so anyone can call it, not only your
form.

- **It checks its input** with `InputValidation.parse` and returns an `InvalidInputError` as
  `{ ok: false, field, problem }`. It returns its errors rather than throwing them: Next
  shows the browser only a digest of a thrown error. Any other error is thrown, and Next
  logs it and shows the error page.
- **It names the scopes it reads in `withCatalystFn`.** A wrapper finds only the apps its
  entry point set, so a forgotten scope means no data access rather than open access. Admin
  proves nothing about the caller: `registerUser` takes it because a person signing up has no
  account yet.
- The form keeps its own client-side rules (`forms.md`). They are for the person typing; the
  action's schema is the one that decides.

## A route handler

`route.ts` holds its own handler - no separate controller file, since the handler has one
caller. A handler checks its input, makes one call to its area and returns the result. It
does nothing else; anything more is business logic and belongs in the area.

## Validation

Input is checked with a zod schema through `InputValidation.parse`
(`@repo/input-validation/input-validation`) - never a check per field. Validation is shape
only: required, an email, a number in range. A rule about the business - "an account with
members cannot be deleted" - is not validation; the area throws it. A schema lives in the
file that uses it until a second caller moves it to `<area>-validation.ts`.

## Boundaries that hold from the first file

These do not wait for a second caller, because breaking one is a security problem, not a
tidiness one:

- **Server and browser code never mix.** Every file that runs only on the server imports
  `server-only`, so a client component that reaches one fails the build.
- **No credential leaves the server.** Never log, return or pass to a client component a
  request header or a failed Catalyst init error - both carry the `x-zc-*` credential
  tokens.
- **One execution context per entry point,** as above - and nothing below an entry point
  starts another, or its lines lose the entry point's id.
