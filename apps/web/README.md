# web

Next.js frontend for the Catalyst monorepo starter kit. Deployed as the Catalyst Slate
app `web`.

Runs on port **4000**, but open the URL `catalyst serve` prints instead (the first free
port from 3000 up, often 3001) - `apps/proxy` is the single origin and forwards every path
here. Calling `:4000` directly skips the Catalyst headers `catalyst serve` adds, so every
Catalyst read fails.

```bash
pnpm dev                  # from the repo root: starts the proxy and web together
pnpm --filter web dev     # this app alone, on :4000
```

See the root `README.md` for setup, deployment, and the rest of the stack.
