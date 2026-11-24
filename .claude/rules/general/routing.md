---
paths:
  - "apps/*/src/*-path.ts"
  - "apps/*/src/app.ts"
  - "apps/*/src/routes/**"
  - "apps/*/src/dev-server.ts"
  - "apps/proxy/**"
---

# Routing

Every app that serves HTTP - the Next.js app, an AppSail, an Advanced I/O function, a
function's dev server - names its paths the same way: each segment is a constant, declared
once, and a path is never a string literal.

## The path file

Each app's segments live in a file named after the app, exporting a constant named after it:

```ts
// apps/billing/src/billing-path.ts
export const BillingPath = {
  Billing: "/billing",
  V1: "/v1",
  Invoices: "/invoices",
  InvoiceId: "/:invoiceId",
} as const;

export type BillingPath = (typeof BillingPath)[keyof typeof BillingPath];
```

- **A full path is its segments added together** - `BillingPath.Billing + BillingPath.V1`.
  Moving a route is then one edit, and a typo is a compile error.
- **The first segment is the app's prefix**, its own name - `/billing`. The local proxy routes
  by prefix, so two apps never share one.
- **A frozen object, not an `enum`.** An enum emits runtime code that Node's strip-only type
  support rejects.

## A Next.js app

`apps/web` names its pages the same way, in `src/web-path.ts`:

```ts
export const WebPath = {
  Home: "/",
  SignIn: "/sign-in",
  SignUp: "/sign-up",
} as const;
```

- **Every path the app writes is a constant** - a `redirect`, a `Link` or `href`, the
  sign-out target, the origin URL a Server Action builds: `redirect(WebPath.SignIn)`, never
  `redirect("/sign-in")`.
- **The folders still decide what a path serves.** Next routes by `app/`, so moving a page
  moves its folder and its `WebPath` entry together, in one change.
- **One entry per page,** added with the page. The file is plain - no `server-only` - since
  client components link with it too.

## Mounting

- `app.ts` mounts one router, `<name>Router`, under the prefix and version:
  `app.use(BillingPath.Billing + BillingPath.V1, billingRouter)`.
- `src/routes/<name>-router.ts` is the only place a router mounts, each under its own
  segment: `billingRouter.use(BillingPath.Invoices, invoiceRouter)`.
- A router names only what follows its segment - `invoiceRouter.get(BillingPath.InvoiceId,
  ...)`. A router-level `use` then covers that router's routes and nothing else.
- Every router is exported with an explicit `: Router` annotation; the declaration emit
  cannot infer the type across the package boundary without it.

## Locally, through the proxy

`apps/proxy` gives local development one origin and Catalyst's sign-in paths, and
`catalyst serve` adds the Catalyst headers on the way in. Each app that serves HTTP gets a route there for its
prefix, pointing at its dev port (8000 and up for an AppSail, 8100 and up for a function):

```ts
// apps/proxy/src/index.ts
const billingProxy = createProxyMiddleware({
  target: "http://localhost:8001",
  changeOrigin: true,
  pathFilter: "/billing",
});
app.use(billingProxy);   // before webProxy, which takes every other path
```

## When the paths move

They stay in the app while only the app reads them. When a second workspace needs them -
the web app calling the API through `HttpClient`, a test in another package - the file moves
to `packages/routing/src/<name>-path.ts` (`@repo/routing/<name>-path`), a framework-free
package with `"types": []`, which the first such move creates. Both then import it, so the
caller and the app can never disagree about a path.
