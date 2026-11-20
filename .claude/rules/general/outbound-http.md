# Outbound HTTP

Every request to a service outside this monorepo goes through `HttpClient`
(`@repo/http-client/http-client`). No `fetch`, no `axios`, no `node:https`, no other
client in `packages/*`, a Node app or `apps/web`. `@repo/eslint-config` enforces this
everywhere - `apps/web`, whose config is built on Next's, through `webImportBan` and its own
`fetch` ban - and the transports under `packages/http-client/src/` (`*-transport.ts`) are
the only exemption.

The point is one seam. Transport, auth headers, encoding, timeout, logging and error
mapping all live in the client, so moving off `fetch` means adding one `HttpTransport`
implementation - not touching call sites.

Who calls `HttpClient` depends on what the service is to this app. Records it keeps for us -
the contacts in a CRM - are read and written by a repository in `@repo/repositories`; work we
ask it to do - create a lead, send an email - goes through a client class in its own
`packages/<service>`. `repositories.md` has the test.

## Using it

One instance per external service, built once at module scope:

```ts
import { HttpClient } from "@repo/http-client/http-client";
import { Logger } from "@repo/logger/logger";

const billing = new HttpClient({
  baseUrl: "https://billing.example.com/v2",
  logger: Logger.for("billing"),
  headers: async () => ({ authorization: `Bearer ${await billingToken()}` }),
});

const { status, headers, body } = await billing.get("/invoices/42", {
  query: { expand: "lines" },
});
const invoice = toInvoice(await body.json());
```

- `headers` is resolved per request, so a token that expires can be refreshed there.
- Map the payload onto a domain type at the call site - `toInvoice(await body.json())`.
  The client has no `parse` hook on purpose; a plain function call does the same job.
- `timeoutMs` on the client is the default; pass it per call for a slow export or a big
  upload rather than loosening it for everything.
- Each call logs `METHOD url -> status in N ms` to the `logger` the client was given, which
  stamps the execution id on the server. A client built without one logs nothing. Bodies
  and headers are never logged, so keep secrets out of the URL.
- The client reads nothing ambient, so it runs in Node and in the browser alike. Whatever a
  call should carry - a token, an execution id - comes in through `headers`, and where its
  line goes comes in through `logger`: a `Logger` on the server, or `console` in the browser.
  The client never writes to `console` itself.

## Request correlation

An outbound call carries `app-execution-id`, the id of the request or run that caused it,
so one id ties this repo's log lines to the upstream's. The client does not look the id
up - it has no request context to read, and in the browser there is none. The app that
owns the request supplies it through the client's `headers` resolver, which runs on
every call:

```ts
const billing = new HttpClient({
  baseUrl: "https://billing.example.com/v2",
  logger: Logger.for("billing"),
  headers: () => ({ [HttpHeader.AppExecutionId]: currentContext().manager.executionId }),
});
```

A per-call `headers` entry overrides the resolver, for an upstream that insists on its own
correlation id:

```ts
await billing.get("/invoices/42", {
  headers: { [HttpHeader.AppExecutionId]: theirCorrelationId },
});
```

## Request bodies

The body decides its own encoding, the way every mainstream client works:

| You pass | Sent as | Content type |
|---|---|---|
| object, array, number, boolean, null | `JSON.stringify` | `application/json` |
| `string` | untouched | `text/plain` |
| `Uint8Array`, `ArrayBuffer`, `Blob` | untouched | `application/octet-stream` |
| `FormData` | untouched | derived by the transport, boundary and all |
| `URLSearchParams` | untouched | derived by the transport |

```ts
await api.post("/things", { name: "widget" });       // JSON, nothing to declare
await api.post("/uploads", form);                    // multipart, boundary and all
```

When the default is not specific enough, say so with a `content-type` header. There is no
separate option for it - one channel, with both halves named:

```ts
import { ContentType } from "@repo/http-client/content-type";
import { HttpHeader } from "@repo/http-client/http-header";

await api.post("/orders", "<order/>", {
  headers: { [HttpHeader.ContentType]: ContentType.Xml },
});
```

A header is never rejected and always wins, so it can carry parameters the enum cannot
express - `application/json; charset=utf-8` arrives intact. Whatever the casing, exactly
one `content-type` reaches the wire.

It may refine, never contradict. A label the bytes do not match only fails at the far end,
so the client rejects the combination up front:

```ts
await api.post("/x", { a: 1 }, { headers: { [HttpHeader.ContentType]: ContentType.Xml } });
// rejects - this body is serialized as JSON

await api.post("/x", form, { headers: { [HttpHeader.ContentType]: ContentType.Multipart } });
// rejects - the boundary is generated with the bytes and cannot be declared
```

A string is never re-encoded, so pass the object rather than `JSON.stringify`-ing it
yourself - otherwise you get `text/plain` and have to correct it with a header.

## Response bodies

Every call resolves to the whole response - `status`, `headers`, and a `body` you read in
whichever form you need. Nothing is decoded until you ask, and asking twice is fine:

| Call | Resolves to | Empty body |
|---|---|---|
| `await body.json()` | `unknown`, `JSON.parse`d | `undefined` |
| `await body.text()` | `string`, UTF-8 decoded | `""` |
| `await body.raw()` | `Uint8Array`, untouched bytes | 0 bytes |

Use `raw()` for anything that is not text - a PDF, an image, a zip. Decoding to a string
first would corrupt it, which is why the transport seam carries bytes rather than text.

`json()` insists on JSON: it rejects with `HttpRequestError.Undecodable` rather than
quietly handing back a string. `text()` and `raw()` never reject, so an HTML error page is
still readable.

## Failures

Both a non-2xx and an unreachable host reject with `HttpRequestError`
(`@repo/http-client/http-request-error`). Everything needed to debug is flat and
synchronous - `method`, `url`, `status`, `headers`, `body` - so logging a failure never
has to await, and its `toString()` prints all of it plus the stack:

```
HttpRequestError: POST https://billing.example.com/v2/invoices responded 422
Status: 422
Headers: {"content-type":"application/json","x-request-id":"req-991"}
Body: {"error":"invalid_qty","field":"qty"}
Stack
    at ...
```

`status` is `undefined` only when nothing came back at all - timeout, DNS, refused.

In an API app, letting it reach `errorHandler` gives a 500, which is the right default for
an upstream failure (`node-api/express-app.md`). Catch it only to map a specific upstream
status onto an `HttpError`:

```ts
try {
  const { body } = await billing.get(`/invoices/${id}`);
  return toInvoice(await body.json());
} catch (error) {
  if (error instanceof HttpRequestError && error.status === 404) {
    throw HttpError.NotFound(`No invoice ${id}.`);
  }
  throw error;
}
```

## Adding a transport

`packages/http-client/src/http-types.ts` is the seam: a transport takes a request whose
body is already encoded and returns the status, the headers and the raw response bytes.
It never decides what a status means and never throws for a non-2xx.

`fetchTransport` is the default, and it is plain fetch, so it works in Node and in the
browser. On Node, undici's global dispatcher already pools connections and keeps them
alive.

Proxying, mTLS or a tuned pool are transport concerns, not client ones, and they are
Node-only, so they go in a transport of their own beside `fetch-transport.ts` - fetch with
an undici `Dispatcher` (not a `node:http` `Agent`, which fetch does not take) - passed as
`transport:` to the client that needs it.

To move to axios, add `packages/http-client/src/axios-transport.ts` beside
`fetch-transport.ts` and pass `transport: axiosTransport`; its equivalent option would be
`httpAgent`/`httpsAgent` in the same position. Note axios would be a new runtime
dependency, which per the root instructions is a decision to bring back to the user - and
it must be added to the deploying app's `package.json` too, since its `scripts/bundle.mjs`
derives the deployed manifest from that file alone.

## Not covered by this rule

Calls inside this repo. The browser does not call our own API at all: `apps/web` reads in
its pages and writes through Server Actions, on its own server, and has no API client
(`.claude/rules/nextjs/code-placement.md`). An outside service that `apps/web` needs is
reached from that server code through `HttpClient`, like anywhere else.
