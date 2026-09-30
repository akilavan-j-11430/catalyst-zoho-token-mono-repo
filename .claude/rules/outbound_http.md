# Outbound HTTP

Every request to a service outside this monorepo goes through `HttpClient`
(`@repo/node-utils/http/http_client`). No `fetch`, no `axios`, no `node:https`, no other
client in `apps/api` or `packages/*`. ESLint enforces this; the transports under
`packages/node-utils/src/http/` are the only exemption.

The point is one seam. Transport, auth headers, encoding, timeout, logging and error
mapping all live in the client, so moving off `fetch` means adding one `HttpTransport`
implementation - not touching call sites.

## Using it

One instance per external service, built once at module scope:

```ts
import { HttpClient } from "@repo/node-utils/http/http_client";

const billing = new HttpClient({
  baseUrl: "https://billing.example.com/v2",
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
- Each call logs `METHOD url -> status in N ms`. Bodies and headers are never logged, so
  keep secrets out of the URL.
- Every call carries `app-execution-id` automatically - see below.

## Request correlation

The client stamps `app-execution-id` on every outbound request, taken from the in-flight
request's `ExecutionContext`. It is the same id the logger prints as `Execution ID`, so one
id ties this repo's log lines to the upstream's for a single request. Nothing to pass at
the call site:

```
app-execution-id: 0f3c1a9e-...    <- currentContext().manager.executionId
```

Outside a request context - a cron, a job, a call at startup - there is no execution to
attribute it to and the header is simply left off. The client does not throw.

It is merged first, so both the client's `headers` resolver and a per-call `headers` entry
override it. Pass one explicitly only when an upstream insists on its own correlation id:

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
import { ContentType } from "@repo/node-utils/enums/content_type";
import { HttpHeader } from "@repo/node-utils/enums/http_header";

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
(`@repo/node-utils/errors/http_request_error`). Everything needed to debug is flat and
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

In `apps/api`, letting it reach `errorHandler` gives a 500, which is the right default for
an upstream failure. Catch it only to map a specific upstream status onto an `HttpError`:

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

`packages/node-utils/src/types/http.ts` is the seam: a transport takes a request whose
body is already encoded and returns the status, the headers and the raw response bytes.
It never decides what a status means and never throws for a non-2xx.

Connection pooling, keep-alive, proxying and mTLS are transport concerns, not client
ones, so they are configured where the transport is built:

```ts
const billing = new HttpClient({
  baseUrl: "https://billing.example.com/v2",
  transport: createFetchTransport({ dispatcher: myUndiciAgent }),
});
```

Note this is an undici `Dispatcher`, not a `node:http` `Agent` - fetch does not take the
latter. Omit it and undici's global dispatcher already pools connections.

To move to axios, add `packages/node-utils/src/http/axios_transport.ts` beside
`fetch_transport.ts` and pass `transport: axiosTransport`; its equivalent option would be
`httpAgent`/`httpsAgent` in the same position. Note axios would be a new runtime
dependency, which per the root instructions is a decision to bring back to the user - and
it must be added to `apps/api/package.json` too, since `scripts/bundle.mjs` derives the
deployed manifest from that file alone.

## Not covered by this rule

`apps/web` calls this repo's own API through the proxy. That is not an external request,
and `apps/web` cannot import `node-utils` anyway - it has its own client in
`src/services/api/client.ts`, built to this same standard and returning the same
`HttpResponse` from `@repo/types/http`. `.claude/rules/web_data_access.md` is its rule.
