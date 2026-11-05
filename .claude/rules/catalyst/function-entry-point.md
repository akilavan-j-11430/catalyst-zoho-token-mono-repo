# Function entry point

`src/index.ts` is the entry point of every Catalyst function in this repo, whatever its
kind. The rule for each kind shows a full entry point. This file explains four things
they all must get right.

- **The export is `module.exports = handler` (or `= app`), exactly.** Catalyst calls the
  module itself, so the export has to be the function. `export default` bundles to
  `{ default: handler }`, which Catalyst cannot call. `export =` fails to typecheck under
  `base.json`'s `module: "ESNext"` (TS1203).
- **Every `zcAuth.init(...)` is awaited.** It is async for the reason
  `apps/api/CLAUDE.md` gives. For an Advanced I/O function it takes the request and reads
  its `headers`. For every other kind it takes the function's context and recognises it
  by `catalystHeaders`.
- **Admin is the only scope wherever no signed-in user made the call.** That is always
  the case for a job or an event. A wrapper that asks for User throws `SCOPE_UNAVAILABLE`.
  The fix is to add an Admin path to the wrapper, not to build a User app.
- **Logging goes through `logger`.** Never bring in `catalyst-logger.ts`: it writes to
  AppSail's log descriptor, and a function does not have one.

`src/index.ts` is the bundle's only entry. A `src/dev-server.ts` is never imported from it,
so the dev server never ships.
