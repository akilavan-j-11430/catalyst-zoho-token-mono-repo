# Testing

Vitest runs every test. A tested workspace keeps its tests in `test/`, beside `src/`, in two
folders that mirror the layout of `src/`. The folder decides the kind:

```
packages/node-utils/
  src/http/http-client.ts
  test/
    unit/http/http-client.test.ts          one class or function, no network, SDKs mocked
    integration/http/http-client.test.ts   several pieces over real HTTP
  vitest.config.ts
  tsconfig.json           src + test + vitest.config.ts, no emit - editor and typecheck
  tsconfig.build.json     src only, emits dist/ - build and dev
```

- A test file is `*.test.ts` and lives under `test/unit/` or `test/integration/`. Any other
  test-like file - one in `src/`, `test/` itself or a `tests/` folder, a `.spec.ts`, a
  `.test.mts` - is a lint error in every workspace, because Vitest would never collect it,
  and under `src/` it would also be compiled into `dist/`. The shared config rejects every
  test file (`testFileBan`), and a workspace that runs Vitest re-allows exactly the
  kinds it has a script for - `allowTestsIn(["unit", "integration"])`, or `["unit"]`
  in `case-conversion` - in its `eslint.config.mjs`. So a test of a kind a workspace does not
  run, or any test in a workspace with no runner (`routing`, `types`, `apps/web`), is a lint
  error too.
- A workspace has a `test:unit` / `test:integration` script only for a folder it has, and an
  empty run fails. A wrong glob or a deleted folder therefore turns `verify` red instead of
  passing with nothing run. Turbo skips a workspace that has no script for the task.
- Test tooling - `vitest`, `@vitest/*`, `supertest`, `@repo/testing` - may be imported only
  from `test/`, `vitest.config.ts` / `.mts`, and `@repo/testing`'s own `src/` (which is test
  tooling). ESLint rejects a static import of it in `src/`, in every TypeScript extension,
  where a bundler would ship it - `apps/web` applies the same ban through `testToolingBan`,
  since its config is built on Next's. A dynamic `import("vitest")` is not checked, nor is a
  dynamic import of a banned SDK; do not write one.
- `@/` resolves to the workspace's `src/`, so a test imports the code under test exactly as
  the code imports itself.
- `tsconfig.json` covers the tests, so `pnpm typecheck` checks them and the editor resolves
  `@/` in them. Only `tsconfig.build.json` emits, and it never sees `test/`.
- A framework-free package (`routing`, `types`, `case-conversion`) - anything `apps/web`
  may import - sets `"types": []` so a Node API in its `src/` does not compile. One without
  tests sets it in `tsconfig.json`. One with tests (`case-conversion`) needs Node types for
  them, so it sets `"types": []` in `tsconfig.build.json` only: there the editor and
  `pnpm typecheck` accept a Node API in `src/`, and only `build` - which `pnpm verify` runs -
  catches it.

## Before calling it done

`pnpm verify` - build, lint, typecheck, unit and integration tests across every workspace.

- The tests fake Catalyst (`zcAuth.init`, the SDK clients), so they never need
  `catalyst serve`. A change to how Catalyst is reached still needs `pnpm dev` and one real
  request through the URL it prints.
- A change to a `scripts/bundle.mjs`, a dependency, or anything a package reads at runtime
  also needs `pnpm bundle`: only the bundle shows what AppSail will run.
- To run one workspace's tests, go through turbo - `pnpm turbo run test:unit --filter=api`.
  `pnpm --filter api test:unit` skips the build of the packages it imports and tests against
  whatever `dist/` is on disk.

## `@repo/testing`

The home for test setup and fakes that more than one workspace needs. It is a
devDependency only and is never imported from any `src/` - ESLint enforces that.

- `@repo/testing/vitest-projects` - `VitestProjects.forWorkspace(import.meta.dirname)`, the settings every
  `vitest.config.ts` starts from: the two projects, the `@/` alias, and the reset below.
- `@repo/testing/catalyst-auth` - `catalystAuth`, the stand-in for `zcAuth`, used by every
  workspace whose code calls `zcAuth.init` - see "Faking Catalyst" below.

It is the one package that breaks the shared-package checklist on purpose: it exports its
TypeScript sources (`"./*": "./src/*.ts"`) and has no `build` and no `dist/`. Vitest
transforms TypeScript itself and nothing else imports the package, so a build would produce
files nobody reads.

A fake moves into it when its second workspace needs it. Until then it lives in that
workspace's `test/`. `catalystAuth` moved here when `@repo/http-server` took the middleware
that calls `zcAuth.init`, since `apps/api` and the package both need it.

## Reset is automatic

The shared config sets `mockReset` and `unstubEnvs`, so before every test each `vi.fn` is
reset and each `vi.stubEnv` undone. A test file writes no cleanup hooks.

`mockReset` returns a `vi.fn(impl)` to `impl`, not to an empty function. Give a fake its
normal behaviour that way and only the test that needs it to fail says so:

```ts
export const catalystAuth = {
  init: vi.fn(async (): Promise<object> => ({})),   // the default every test starts from
};

catalystAuth.init.mockRejectedValue(new Error("app/invalid_project_details"));   // one test
```

A `beforeEach` still has a place for values a test *needs* - `vi.stubEnv("AUTH_REDIRECT_URL",
...)` in `app.test.ts` - since it runs after the reset.

## Faking Catalyst

No test reaches Catalyst. What gets faked depends on what is under test:

| Under test | Fake | Example |
|---|---|---|
| A wrapper in `node-utils/src/catalyst/` | the `@zcatalyst/*` package it calls | `zcql.test.ts` mocks `@zcatalyst/datastore` |
| A route in `apps/api` | our wrapper (`@repo/node-utils/catalyst/...`), and `zcAuth.init` | `app.test.ts` mocks `UserManagement` |
| Middleware in `@repo/http-server` | `zcAuth.init` | `middleware.test.ts` |
| A repository in `node-utils/src/repositories/` | the `@zcatalyst/*` package, so the real wrappers run and each call's app shows its scope | `zoho-connection-repository.test.ts` mocks `@zcatalyst/datastore` |
| A service in `node-utils/src/services/` | the repository, resource handles and other services it calls | `connection.test.ts` mocks `ZohoConnectionRepository`, `zohoConnectionCache`, `ZohoAccounts` and `UserManagement` |
| A route that uses a Zoho connection | the app's connection (`@/zoho-connections`) | `zoho-token.test.ts` mocks `userZohoConnection` |

`apps/api/src/zoho-connections.ts` reads the Zoho client keys at module scope, so importing
`@/app` needs them before any test runs. `apps/api/vitest.config.mts` sets test values for
them in `test.env`; a key a route reads per request is stubbed by the test that needs it.

`ZohoConnection` keeps its token caches and grant locks at module level, so they outlive a
test. `connection.test.ts` gives every test a reference id of its own instead of resetting
them.

`zcAuth.init` is faked for every test in `apps/api` and `@repo/http-server`, each by its own
`test/setup.ts` (named in `setupFiles` in its `vitest.config`), because no test
request carries the headers `catalyst serve` injects. The setup spreads the real
`@zcatalyst/auth` module and swaps only `zcAuth`, so its other exports stay real. Control the
fake through `catalystAuth` from `@repo/testing/catalyst-auth`. A test that guards a route should
also assert the scope it asked for:

```ts
expect(catalystAuth.init).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
  scope: CatalystScope.Admin,
});
```

Mocking a module takes two calls, because Vitest hoists `vi.mock` above the imports:

```ts
const { executeZcqlQuery } = vi.hoisted(() => ({ executeZcqlQuery: vi.fn() }));

vi.mock("@zcatalyst/datastore", () => ({
  Datastore: class {
    executeZCQLQuery = executeZcqlQuery;
  },
}));
```

- `vi.hoisted` creates the spy before the factory runs; a plain `const` would not exist yet.
- The specifier must match the import in the code under test exactly. A mismatch does not
  fail - the real module runs.
- `vi.mock` names the SDK as a string, so the ESLint ban on importing `@zcatalyst/*` outside
  `catalyst/` still holds in tests.

A wrapper reads its app from the request context, so a `node-utils` unit test runs it inside
one, with a stand-in app for the scope it uses - see `queryAsUser` in `zcql.test.ts`. This
helper stays in `node-utils`: from `@repo/testing` it would load `dist/` while the test loads
`src/`, two `AsyncLocalStorage` instances that never see each other.

## Integration tests

- `apps/api` drives the Express app from `src/app.ts` through Supertest -
  `request(app).post(path).send(body)` - with no port to manage.
- A test of an outbound client stands up a fake upstream with `node:http` on port 0. That is
  the one import `test/integration/` may use that the rest of the repo may not.
- An integration test checks the whole response: status and the full body, not a fragment.

## Adding tests to a workspace

1. `vitest` and `@repo/testing` as devDependencies, `"workspace:*"` for the latter. An app
   whose integration tests drive its HTTP server also takes `supertest` and
   `@types/supertest`, as `apps/api` does.
2. `vitest.config.ts`: `export default VitestProjects.forWorkspace(import.meta.dirname);` - named
   `vitest.config.mts` in a CommonJS workspace (`apps/api`), or Vite loads its ESM syntax as
   CommonJS and warns. List the file in `tsconfig.json`'s `include`.
3. `"test:unit": "vitest run --project unit"` for `test/unit/`, and
   `"test:integration": "vitest run --project integration"` for `test/integration/` - only
   the ones whose folder exists, since an empty run fails.
4. `@types/node` and `"types": ["node"]` in its `tsconfig.json`, since the config runs in Node.
   A framework-free package moves its `"types": []` to `tsconfig.build.json`, as above.
5. `allowTestsIn([...])` from `@repo/eslint-config` in its `eslint.config.mjs`, naming
   the same kinds as step 3, or lint rejects the new test files.
