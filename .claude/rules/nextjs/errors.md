---
paths:
  - "apps/web/**"
  - "apps/*/next.config.ts"
  - "apps/*/src/app/**"
  - "apps/*/src/components/**"
---

# Errors

Next splits errors in two, and so does this app: a failure the code expects is returned, and
one it does not is thrown.

## An expected failure is a return value

A field the server rejects, a record the caller may not change - a Server Action returns it as
`{ ok: false, field, problem }` and the form shows it (`forms.md`). Never throw for it: a
thrown error reaches the browser as a digest and nothing else, so the visitor could not be
told what to fix.

## An uncaught error is logged once and shown once

Anything else is thrown and left uncaught. Three files handle it, and a page or action adds no
`try/catch` of its own to log or hide it:

| File | Does |
|---|---|
| `src/instrumentation.ts` | `onRequestError` logs it on the server, source `request-error`, with the route type, the path and the digest |
| `src/app/error.tsx` | shows `PageError` in place of the page or layout that failed, inside the root layout |
| `src/app/global-error.tsx` | shows `PageError` when the root layout itself fails, so it renders its own `<html>` and `<body>` and imports `globals.css` |

- **The digest joins the two.** `PageError` shows it as the reference, and the
  `request-error` line carries the same value, so a reference a visitor reads out finds its
  line.
- **The `request-error` line has no execution ID.** Next calls `onRequestError` outside
  `withCatalystPage` and `withCatalystFn`, so there is no execution context. A scope
  `setApps` cannot build is also logged by `execution-context.ts`, with the execution ID.
- **Log the path without its query string, and never `request.headers`.** The headers carry
  the caller's Catalyst credentials, and a query string can carry a token.
- **Never show `error.message`.** For a server error it is Next's generic text in production
  and the real message in development, so a screen built on it differs between the two.
- **`retry()`, not `reset()`.** `retry` reads the page again from the server; `reset` only
  re-renders what the browser already has, which fails the same way.

`PageError` (`src/components/shared/page-error.tsx`) is built from shadcn's `Card` and
`Button`. A part of the app that needs its own wording adds an `error.tsx` beside its pages
that renders `PageError` with a prop for that wording - add the prop then, not before.
