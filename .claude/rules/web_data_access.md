---
paths: apps/web/**
---

# Reaching the API from the browser

`apps/api` is reached through the service layer, and nowhere else. No `fetch` in a
component, no URL string outside `endpoints.ts`, no `useState` pair standing in for a
request.

Two folders, three jobs, and the split is what keeps a change to any one of them local:

```
src/services/<domain>.ts  the calls themselves, typed, one file per domain
src/services/api/client.ts     transport - one fetch, one envelope, one error type
src/services/api/endpoints.ts  every path this app calls
```

`src/services/api/` is plumbing and changes when the transport does - a header, a timeout,
a move off `fetch`. The files beside it are vocabulary and change when the product does. A
component imports a domain file and nothing below it; that the call travels over HTTP at
all is not its business.

It mirrors `packages/node-utils/src/services/catalyst/` on the server side, for the same
reason: one directory should answer what this app asks of the API, and a call made from a
component is invisible there.

## Where new work goes

| You are adding | It goes in |
|---|---|
| a call to a route that already exists | `src/services/<domain>.ts` - the file for that domain |
| the first call for a new domain | a new `src/services/<domain>.ts` |
| a path | `src/services/api/endpoints.ts`, nowhere else |
| something the client cannot express yet - an upload, a retry, a redirect policy | `src/services/api/client.ts` |
| a header, a timeout, a retry, a move off `fetch` | `src/services/api/client.ts` |
| query keys, once more than one query exists | `src/services/query_keys.ts` |
| a form's validation rules | the component that owns the form, as a `Resolver` - until a second form needs them |
| a shape `apps/api` also uses | `packages/types/src/<name>.ts` |

Four things follow from that table and are worth stating as rules, because each one is a
tempting shortcut:

- **A capability the client does not have is added to the client**, never a `fetch` at
  the call site and never a second client. It is the same rule as
  `.claude/rules/catalyst_sdk.md`: a capability used from a call site but invisible in the
  layer is the thing to avoid. One that turns out to be single-use is still the right
  shape - the client is a seam, and a seam is right at one caller.
- **A service function never builds a URL.** It names one from `endpoint`. If the path
  needs an argument, `endpoints.ts` exports a function for it -
  `byId: (id: string) => ...` - so the shape of the URL stays in one file.
- **A service function never touches react-query**, and a component never touches the
  client. The service is a plain async function; `useQuery`/`useMutation` wrap it at the
  call site. That is what keeps it callable from anywhere and testable with no provider.
- **A component never imports from `src/services/api/`.** It imports a domain file. The
  one exception is `ApiError`, which the error layer needs to decide what a toast says.

## Adding a call

Name the path, then the call. A component never sees either:

Paths are relative to the client's `baseUrl` - the `/api` prefix lives on the client, not
on every path, the way the server's `HttpClient` takes them:

```ts
// src/services/api/endpoints.ts
const segment = (value: string): string => encodeURIComponent(value);

export const endpoint = {
  auth: { register: "/auth/register" },
  warranty: {
    all: "/warranties",
    byId: (id: string) => `/warranties/${segment(id)}`,
  },
} as const;

// src/services/warranty.ts
export async function fetchWarranty(id: string): Promise<Warranty> {
  return recordOf<Warranty>(await api.get(endpoint.warranty.byId(id)));
}
```

The shape it returns comes from `@repo/types`, never redeclared here - `apps/api` builds
the same response from the same type, so the two cannot drift.

### A path with an id in it

**A path that takes a value is a function on `endpoint`, and the value goes through
`segment`.** Not a `"/warranties/:id"` template substituted at the call site, and not a
template literal built where the call is made.

A function is checked: the compiler knows `byId` needs one string, so a missing or
misspelled parameter is a compile error rather than a URL reading `/warranties/undefined`.
A `:id` template is a string until it reaches the wire, and nothing catches the typo.

`segment` is `encodeURIComponent`, and it is not optional. A ROWID is digits and survives
anything, but the moment a path carries an email, a slug or a name, a `/`, `?`, `#` or
space silently changes which route the server sees - `a/b` becomes two segments, and
everything after a `#` never leaves the browser. Encoding once inside `endpoints.ts` means
no call site has to remember.

Values that are **not** part of the path are `query`, not a segment:

```ts
await api.get(endpoint.warranty.all, { query: { status: "open", page: 2 } });
```

## What a call resolves to

`api.get | post | put | patch | delete` resolve to **the whole response**, the same shape
`HttpClient` returns on the server - `@repo/types/http` holds it, so the two cannot drift:

| You read | You get | Empty body |
|---|---|---|
| `await body.json<T>()` | `T`, `JSON.parse`d | `undefined` |
| `await body.text()` | `string`, UTF-8 decoded | `""` |
| `await body.raw()` | `Uint8Array`, untouched bytes | 0 bytes |

Nothing is decoded until asked, asking twice is fine, and `status` and `headers` are there
for the calls that need them. `json<T>()` asserts `T` rather than checking it - name the
shape the endpoint documents. It rejects rather than handing back a string when the body
is not JSON; `text()` and `raw()` never reject, so an HTML error page stays readable.

## Options, at both levels

The two levels are the server's, and `RequestOptions` is literally the same type:

```ts
// the client - defaults every call carries
export const api = new ApiClient({ baseUrl: "/api" });

const authed = new ApiClient({
  baseUrl: "/api",
  headers: async () => ({ authorization: `Bearer ${await token()}` }),
  timeoutMs: 20_000,
});

// one call - query, headers, timeoutMs
await api.get(endpoint.warranty.byId(id), {
  query: { expand: "lines" },
  headers: { "x-trace": id },
  timeoutMs: 60_000,
});
```

`headers` on the client is resolved **per call**, so a token that expires refreshes there.
Merge order is content type, then the client's resolver, then the call's own headers - so
a per-call header always wins. `timeoutMs` on the call overrides the client's.

The body picks its own encoding, again as on the server: an object becomes JSON, a string
is `text/plain`, `Blob`/`ArrayBuffer` are binary, and `FormData`/`URLSearchParams` are left
alone so the multipart boundary generated with their bytes survives. A `content-type`
header refines that when the default is not specific enough.

`baseUrl` stays **relative**, unlike the server's, which demands an absolute URL. The proxy
keeps the browser and the API on one origin; an absolute base would send the call
cross-origin, where it arrives with no session cookie and none of the Catalyst headers
`zcAuth.init(req)` reads.

**`recordOf(response)` is how a service reads our own API.** `apps/api` answers every route
with `{ status, data }`, and `recordOf` is the only place that knows it, so a service
returns a record and never the envelope around it. Reach for `body.json()` directly only
when a route does not use the envelope.

A non-2xx and an unreachable server both reject with `ApiError`, which carries `method`,
`url`, `status`, `headers` and `body` flat and synchronous - the server's
`HttpRequestError` in every respect but one: its `message` is the API's own message when
the envelope carried one, because this error is shown to a person rather than logged.

## Calling it

**Server state belongs to react-query.** Never call a service function from an effect
and park the result in `useState` - that hand-rolls loading, error, staleness and race
handling that `useQuery` already has, and it bypasses the error layer below.

```ts
const { data } = useQuery({
  queryKey: ["warranty", id],
  queryFn: () => fetchWarranty(id),
});

const { mutate, isPending } = useMutation({
  mutationFn: registerUser,
  onSuccess: (registered) => toast.success(`Invited ${registered.emailId}.`),
});
```

A query key starts with the domain and narrows - `["warranty", id]` - so a mutation can
invalidate a whole domain or one record. When the first real query arrives, the keys move
into `src/services/query_keys.ts` and stop being written inline.

**Failures are already handled.** `QueryProvider` wires `onError` on both the query and
the mutation cache to a toast, so a call site writes `onSuccess` and nothing else. Add a
local `onError` only to do something *besides* reporting - focusing a field, rolling back
an optimistic write. Reporting is not its job.

Success messages stay at the call site. Every failure has the same shape and every success
does not.

## Forms

**Every form is react-hook-form.** No `useState` per field, no hand-rolled `onChange`.

Rules reach the form as a `Resolver`, and the resolver lives **in the component that owns
the form** - `sign_up_form.tsx` is the worked example. One form's rules are used by one
form, and a file that exists only to move fifteen lines somewhere else buys nothing; it
moves out when a second form needs the same rules, and that form tells you what the shared
shape is. This is the general rule in `.claude/CLAUDE.md` about what earns a file.

The resolver returns cleaned values - trimmed, coerced - so whatever submits them never
repeats that work. `FormField` (`components/shared/form_field.tsx`) takes the result of
`register` as its `field` prop.

Client-side rules are for the person typing, not for the server. `apps/api` validates the
same request again and is the one that decides; these two never share code, because the
browser's copy can be skipped and the server's cannot.
