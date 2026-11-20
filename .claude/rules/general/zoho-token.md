# Zoho token access

Every Zoho access token comes from a `ZohoConnection`
(`@repo/zoho-token/zoho-connection`). It mints from the stored refresh token, caches the
result in the process and in Catalyst Cache, renews five minutes before expiry, and
serializes concurrent mints per user. Nothing else in the repo talks to the Zoho accounts
server or holds a token - `ZohoAccounts` (`@repo/zoho-token/zoho-accounts`) is that server's
one seam, and only the connection calls it.

## One connection per app

An app declares its connection once, in `src/zoho-connections.ts`, the way `resources.ts`
declares Catalyst resources. It lives in the app rather than in `@repo/zoho-token` because
its credentials are the app's env keys:

```ts
// apps/web/src/zoho-connections.ts
export class ZohoConnections {
  private static signedInUser: ZohoConnection | undefined;

  static user(): ZohoConnection {
    ZohoConnections.signedInUser ??= ZohoConnection.create(
      {
        accountsUrl: env.get("ZOHO_TOKEN_ACCOUNTS_URL"),
        clientId: env.get("ZOHO_TOKEN_CLIENT_ID"),
        clientSecret: env.get("ZOHO_TOKEN_CLIENT_SECRET"),
      },
      currentUserGrant,
    );
    return ZohoConnections.signedInUser;
  }
}
```

It is built on first use, not at module scope: `next build` loads every page module and has
no Zoho keys, so a `const` built at import would fail the build. Call
`ZohoConnections.user()` wherever a token is needed, and never `ZohoConnection.create`
anywhere else. A second connection for the same client would still share the caches, but it
would split what the app asks of Zoho across two places.

## Calling a Zoho API

Ask for the token per request, inside the `headers` resolver of that service's
`HttpClient` (see `.claude/rules/general/outbound-http.md`):

```ts
import { HttpClient } from "@repo/http-client/http-client";
import { HttpHeader } from "@repo/http-client/http-header";
import { Logger } from "@repo/logger/logger";
import { ZohoConnections } from "@/zoho-connections";

const crm = new HttpClient({
  baseUrl: "https://www.zohoapis.in/crm/v8",
  logger: Logger.for("zoho-crm"),
  headers: async () => ({
    [HttpHeader.Authorization]: `Zoho-oauthtoken ${await ZohoConnections.user().getToken()}`,
  }),
});
```

- **The scheme is `Zoho-oauthtoken`, not `Bearer`.** That is the form Zoho's API docs
  use.
- **Never keep the token yourself.** That rules out a module-level `const`, a cache of
  your own, and a header object built once. `getToken()` is cheap on a cache hit, and a
  copy held elsewhere either expires mid-flight or outlives the user it belongs to.
- The API host follows the same DC as `ZOHO_TOKEN_ACCOUNTS_URL`. A `.in` accounts server
  issues tokens for `zohoapis.in`.

## Whose token it is

A `GrantSource` decides whose grant a call uses. The connection's default comes from
`create`. `withGrant` overrides it for the rest of the execution:

| Grant | Use when | Reference id | Reads its refresh token with |
|---|---|---|---|
| `currentUserGrant` | a page or action with a signed-in user | the caller, looked up once per execution | `ZohoConnectionRepository.findRefreshToken` - User |
| `userSpecificGrant(id)` | a job, or any execution acting for a named user | `id`, checked to be numeric | `ZohoConnectionRepository.findRefreshTokenForJob` - Admin |

`userSpecificGrant` reads as Admin because a job has no user to read as. That is safe only
while `id` is the job's own - never build one from a value the request supplied.

Each repository method picks its own scope (`repositories.md`), so the grant never passes
one in. `isConnected`, `persistToken` and `disconnect` are signed-in user operations and
read with User. Deleting a grant Zoho rejected can happen inside a job too, so that delete is
Admin.

Both scopes have to be set before the connection runs. Catalyst starts empty for every
execution, so a page or Server Action that uses a connection lists
`[CatalystScope.User, CatalystScope.Admin]` in `withCatalystPage` / `withCatalystFn` - User
for the caller and their row, Admin for Catalyst Cache (admin-only) and that delete. The
home page and the three Zoho actions all do.

The `ZohoConnection` table is read and written only through `ZohoConnectionRepository`
(`@repo/repositories/zoho-connection-repository`), the one file that names its columns. Its
App User scope is **USER**: a signed-in user sees only the rows their own credentials
created. So `ZohoConnectionRepository.insert` is always User scope, whatever the grant, and
changing the table back to GLOBAL would let any app user read every refresh token from the
browser SDK.

A job has no signed-in user, so it names one **before any other Zoho call**:

```ts
ZohoConnections.user().withGrant(userSpecificGrant(referenceId));
const token = await ZohoConnections.user().getToken();
```

**`withGrant` writes to the execution context, never to the instance, and it must stay
that way.** The connection is a singleton shared by every concurrent request. A grant
stored on it would make every in-flight request mint the token of whichever user a job
switched to last. That is why it returns `void` rather than a field setter or a new
instance's state. Do not turn it into one.

A connection with no grant from `create` and none from `withGrant` throws
`ZohoAuthError` (`NotConfigured`) on first use. It never falls back to the signed-in
user.

## Failures

Everything a connection throws is a `ZohoAuthError`
(`@repo/zoho-token/zoho-auth-error`), carrying a `ZohoAuthErrorCode` or Zoho's own error
string. Letting it throw from a page or Server Action shows the error page, which is right
for `invalid_client` or an unreachable accounts server. Catch it only to map a code the user
can fix, and return it as the action's `{ ok: false, problem }` - Next shows the browser
only a digest of a thrown error:

```ts
try {
  await ZohoConnections.user().getToken();
} catch (error) {
  if (error instanceof ZohoAuthError && error.code === ZohoAuthErrorCode.NotConnected) {
    return { ok: false, problem: "Connect your Zoho account first." };
  }
  throw error;
}
```

`NotConnected` means no refresh token is usable for that user. The fix is the consent flow
below.

## The consent flow

Every step that needs the signed-in user runs in a Server Action, so it carries the
request's Catalyst headers. Zoho's redirect is a plain navigation to a page:

| Step | Who | What |
|---|---|---|
| 1 | home page | `connectZoho` (`app/(app)/connect-zoho.ts`) answers `{ ok: true, consentUrl }`, or `{ ok: false }` for a connected user |
| 2 | browser | goes to `consentUrl`, Zoho's consent screen |
| 3 | Zoho | sends the browser to the `/zoho-token/callback?code&state` page |
| 4 | callback page | calls `completeZohoConsent` (`app/(app)/zoho-token/callback/complete-zoho-consent.ts`), which stores the grant and revalidates the home page, then goes home |

The redirect uri is `WebPath.ZohoTokenCallback` on the Server Action request's `Origin`
(`RequestUrl.absolute`), so steps 1 and 4 send the same url and no key configures it. The
Zoho client's Authorized Redirect URI must be exactly that url, once per origin the app
runs on - locally the one `catalyst serve` prints, and the Slate domain.

Do not store the grant while the callback page renders. A render can run more than once - a
prefetch, a refresh - and a grant code is single-use at Zoho, so the page hands the code to
an action, once per mount.

## The connection's lifecycle

| State | How it is reached | What `isConnected` says |
|---|---|---|
| not connected | no row | `false` |
| connected | the callback stored a row | `true` |
| rejected by Zoho | the user or an admin revoked it, or Zoho pruned it (a user keeps about 20 refresh tokens per client) | `true` until the next mint, which answers `invalid_code`, deletes the row and throws `NotConnected` |
| disconnected | `disconnectZoho` revokes at Zoho and deletes the row, after the user confirms | `false` |

A grant Zoho has rejected recovers itself: `getToken` deletes it on the first failed mint,
so the following connect asks for consent again. Do not catch `invalid_code` around
`getToken` - it never reaches you; `NotConnected` does.

## The consent state

The `state` on the consent url is signed, not stored: `issuedAt.signature`, where the
signature is HMAC-SHA256 over the reference id and `issuedAt`, keyed by the client secret
under a fixed label. The callback recomputes it for the **signed-in caller** and rejects it
when it does not match or is more than ten minutes old (one minute of clock skew allowed).
So connecting costs no Catalyst call.

- The reference id is in the signature, never in the url, so a state issued to one user
  fails for every other - which is the whole job of the state.
- It is not single-use, and need not be: a grant code is single-use at Zoho, and a user
  already connected stops before any exchange.
- Rotating the client secret invalidates only the consent screens open at that moment.

Do not move it back into Catalyst Cache. That buys single-use, which nothing here needs,
for three calls per connect.

## What is cached where

| Value | This process | Catalyst Cache | Table |
|---|---|---|---|
| access token | LRU, checked against `expiresAt` | `ZOT:<id>`, one hour | - |
| refresh token | LRU, until Zoho rejects it | **never** | `REFRESH_TOKEN`, encrypted |

A mint after the first reads the refresh token from the LRU, so it costs no ZCQL call. The
refresh token never goes to Catalyst Cache: the table keeps it in an encrypted column, and
a cache entry would hold the same long-lived secret in the clear.

A cached refresh token can be stale - another instance may have disconnected or
reconnected the user since. So Zoho rejecting a **cached** token only evicts it, and the
mint retries with the table's token; only a rejection of the **table's** token deletes the
grant. `disconnect` reads the table rather than the LRU for the same reason: revoking a
stale token would leave the live one working at Zoho.

Deleting a grant clears both of this process's LRUs and the Catalyst Cache entry, not other
server instances' LRUs. Another instance may keep serving the old access token until it
expires, which is at most an hour, and may report `isConnected` from its cached refresh token
until its next mint is rejected.

A user who denies consent comes back to the callback page with `error` and no code. The
page tells them so and goes home without calling the action, so nothing is stored.
