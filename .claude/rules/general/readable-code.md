# Readable code

Three rules for every workspace: one casing, specific names, and the simplest code that
does the job.

## camelCase only

Every identifier and every key this repo defines is camelCase - `emailId`, `nextPageToken`,
`createdTime`. That includes the JSON `apps/api` sends and `apps/web` reads.

When something outside the repo answers in another case - Catalyst's `email_id`, a vendor's
`Next-Page-Token`, a table's `CREATEDTIME` - convert it to camelCase at the first point it
enters our code, and use only the converted value from there on:

```ts
// packages/node-utils/src/catalyst/user-management.ts
function toRegisteredUser(details: RegisteredUserDetails): RegisteredUser {
  const { userId, emailId, firstName, lastName, isConfirmed } = CamelCase.convertKeys(details);
  return { userId, emailId, firstName, lastName, isConfirmed };
}
```

- The vendor's casing appears in exactly two places: the type that describes the wire
  shape, and the function that maps it to ours. Nothing past that function sees it.
- Convert with `CamelCase.convertKeys` (`@repo/case-conversion/camel-case`), as above,
  rather than renaming field by field. It renames keys at any depth and types the result,
  so a misspelt field is a compile error. Still pick the fields you expose, so the rest of
  the vendor's record does not leak.
  It cannot split a word with no separator - `CREATEDTIME` becomes `createdtime` - so
  Catalyst table rows are mapped field by field in their repository instead.
- ESLint enforces it (`@typescript-eslint/naming-convention`, from `@repo/eslint-config`).
  The vendor seams are exempt through `allowVendorNames(files)` - `catalyst/`,
  `repositories/` and `services/zoho/accounts.ts` in `node-utils`, plus `apps/api`'s `env.ts`
  and `catalyst-logger.ts` - and so are three tests whose inputs are vendor-cased:
  `case-conversion`'s `camel-case.test.ts`, and `node-utils`' `env.test.ts` and
  `user-management.test.ts`. `apps/web` builds on Next's config instead and leaves
  `src/catalyst/` out of the rule's `files` with `ignores`. A key that needs quotes
  (`"content-type"`, `"--width"`) is a wire string and is never checked. Add a file to the
  exemption only when it is a seam, or a test whose input is the vendor's casing - the
  converter's fixtures, an environment variable name - and then name the one file, never a
  folder. A fake vendor response is written as a JSON string, so it needs none.
- For an external HTTP call that function is the `toX(await body.json())` at the call site
  - see `outbound-http.md`.
- For a Catalyst table, the `Row` type in `resources.ts` keeps the column names as Catalyst
  spells them (`TITLE`, `ROWID`), because ZCQL needs them. Map a `StoredRow` to a camelCase
  domain type before it leaves the code that read it - a route never returns `ROWID`.
- Sending works the same way in reverse: build the vendor's shape from our camelCase value
  at the last moment, as `register` does with `first_name: user.firstName`.

## Names say what the thing is

A name is specific to what it holds in this code, so a reader understands it without
reading the line that assigned it.

| Not | But |
|---|---|
| `data`, `result`, `response` | `invoice`, `storedRows`, `queryResult` |
| `item`, `obj`, `value`, `info` | `todo`, `bucketObject`, `retryDelayMs` |
| `list`, `arr` | `pendingInvoices` |
| `temp`, `x`, `cb`, `fn` | name the role: `startTime`, `handler` |
| `flag`, `check` | `isExpired`, `hasMore` |

A short name is fine where its scope is a line or two and the meaning is obvious -
`(row) => row.TITLE`, a loop index `i`.

## The simplest code that works

Write the version a new reader understands on the first pass: plain control flow, one thing
per line, no cleverness to save a few characters. Between two versions that both work,
pick the simpler one.

Reach for more complex code only when it buys a real, measurable performance gain on a path
that matters - fewer Catalyst round trips, fewer passes over a large list, less memory on a
big upload. Then say why in a short comment, so the next reader does not simplify it back:

```ts
// One bulk call instead of N single-row inserts - each insert is a billed round trip.
await todoTable.runIn(CatalystScope.User).insertRows(newTodos);
```

A guess that something might be slow is not a reason. Saving a microsecond on a path that
then waits 200 ms on the network is not either.
