---
paths:
  - "apps/web/**"
  - "apps/*/next.config.ts"
  - "apps/*/src/app/**"
  - "apps/*/src/components/**"
---

# Forms

**Every form is react-hook-form.** No `useState` per field, no hand-rolled `onChange`.

Rules reach the form as a `Resolver`, and the resolver lives **in the component that owns
the form** - `sign-up-form.tsx` is the worked example. One form's rules are used by one
form, and a file that exists only to move fifteen lines somewhere else buys nothing; it
moves out when a second form needs the same rules, and that form tells you what the shared
shape is. This is the general rule in `.claude/CLAUDE.md` about what earns a file.

The resolver returns cleaned values - trimmed, coerced - so whatever submits them never
repeats that work. `FormField` (`components/shared/form-field.tsx`) takes the result of
`register` as its `field` prop.

Client-side rules are for the person typing, not for the server. The Server Action the form
calls - `registerUser` in `app/(auth)/sign-up/register-user.ts` - validates the same input
again with its own zod schema and is the one that decides; these two never share code,
because the browser's copy can be skipped and the server's cannot. `code-placement.md`
covers the action itself.

## Calling the Server Action

The form calls the action inside `useTransition`, so `isPending` covers the whole round
trip. The action answers `{ ok: true, ... }` or `{ ok: false, field, problem }`, and the
form decides what each one shows:

```ts
const [isPending, startTransition] = useTransition();

function submit(user: NewUser): void {
  startTransition(async () => {
    try {
      const result = await registerUser(user);
      if (!result.ok) {
        // The server's own check, on a field the browser's rules let through.
        if (result.field in EMPTY) {
          setError(result.field as keyof NewUser, { message: result.problem });
        } else {
          toast.error(result.problem);
        }
        return;
      }
      toast.success("Check your email", { description: `...${result.registered.emailId}` });
      reset(EMPTY);
    } catch {
      toast.error("Your account could not be created. Please try again.");
    }
  });
}
```

- **A field the server rejected goes on that field**, with `setError`, so it reads like the
  browser's own rules. A `field` the form does not have is a toast.
- **Anything thrown is a toast the form raises**, in words a person can act on. Next shows
  the browser only a digest of a thrown error, so the form never shows `error.message`.
- **Success is the form's to say** - a toast, a redirect, a reset - since every success is
  different.
- **The wait shows from the click**: the form swaps itself for `Loader` while `isPending`,
  as `SignUpForm` does, or disables its submit button with a pending label
  (`component-design.md`).
- **A write the page shows is re-read by the action.** After a create, update or delete that
  changes what a page lists, the action calls `revalidatePath("<that page's path>")` (`next/cache`)
  before it returns, so the page's Server Component reads again in the same round trip.
  Without it the list stays as it was until a reload. Sign-up changes nothing a page shows,
  so `registerUser` has none.
