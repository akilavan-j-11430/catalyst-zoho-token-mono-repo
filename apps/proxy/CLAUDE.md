# apps/proxy

Reverse proxy that gives local development a single origin. Runs as the Catalyst
AppSail named `proxy`, and is the only service the browser talks to directly.

**This app is never deployed.** Catalyst provides the single origin and auth gate
natively in the cloud, so the proxy exists purely to reproduce that shape on your
machine. It is declared in `catalyst.json` so `catalyst serve` can run it; `pnpm deploy`
ships only `appsail:api` and `slate:web`. Do not add it to the deploy list.

Port: `X_ZOHO_CATALYST_LISTEN_PORT` when the CLI injects it (4600 in practice), else
**3000** as a standalone fallback. Under `catalyst serve` the CLI fronts it on a
separate, first-free port from 3000 upward - commonly 3001 or 3002. That printed URL is
the entry point, not 3000.

## Routing

`src/index.ts` registers two `http-proxy-middleware` instances, in order:

| Path | Upstream | Serves |
|------|----------|--------|
| `/api` | `http://localhost:8000` | `apps/api` (Express) |
| everything else | `http://localhost:4000` | `apps/web` (Next.js) |

Both set `changeOrigin: true`. The catch-all has `ws: true` for HMR. WebSocket
upgrades are dispatched in the `server.on("upgrade")` handler using the same
`/api` prefix test, so `/api` upgrades reach the API and all others reach Next.js.

There is no path rewriting - `/api/foo` arrives at the API as `/api/foo`, which is
what `apps/api` mounts its middleware on.

## Auth

`app-config.json` sets `catalyst_auth: true` with `login_redirect: "/"`. Locally, login
is enforced here and nowhere else - `apps/api` deliberately does not set it, because it
is only reachable through this proxy.

## Running

There is no `dev` script - the proxy runs from bundled output through the Catalyst CLI.
From the repo root:

```bash
pnpm dev      # everything: this proxy via catalyst serve, plus api, web, watchers
pnpm serve    # this proxy alone
```

`pnpm dev` runs `catalyst serve` with **stdin redirected from `/dev/null`**. When its
stdin is not a terminal, the CLI waits for EOF before starting the AppSail - and a
process manager's pipe never sends one, so it hangs. The front port still binds, so
every request 502s and it looks like a proxy fault. Do not drop that redirect.
Running `pnpm serve` yourself is unaffected: a terminal takes the interactive path.

Because it serves the bundle, **edits to `src/` require a re-bundle** to take effect.

Running `node appsails/proxy/index.js` by hand works for the frontend but breaks the
API: the Catalyst SDK parses project details off request headers, and only
`catalyst serve` injects them. Every `/api` call 500s with `app/invalid_project_details`.

## Build output

`scripts/bundle.mjs` wipes and rebuilds `appsails/proxy/` at the repo root:
esbuild bundles `src/index.ts` to `index.js` (cjs, node24, `packages: "external"`),
writes a minimal `package.json`, copies `app-config.json`, then runs `npm install`
there. `appsails/` is gitignored. `catalyst.json` points the AppSail source at it.

Note the package.json emitted by the bundle script is **hand-written inside the
script**, not derived from `apps/proxy/package.json`. Adding a runtime dependency
means editing that literal too.
