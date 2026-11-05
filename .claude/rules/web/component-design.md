---
paths:
  - "apps/web/**"
---

# Component design

Four rules for `apps/web`: a trigger owns what it opens, styling lives in shared
components, a page uses the full width, and no wait ever looks stuck.

## A trigger and what it opens are one component

A button that opens a dialog, and the dialog, are one component. The same goes for every
trigger with an overlay - a sheet, a popover, a dropdown menu, a confirmation. That
component owns the open state, and its parent renders it as one element:

```tsx
// src/components/users/invite-user-dialog.tsx
export function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Invite user</Button>
      </DialogTrigger>
      <DialogContent>
        <InviteUserForm onInvited={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

// the page
<InviteUserDialog />
```

- Never split them: no `useState(false)` in a parent for an overlay it does not render,
  and no `open` / `onOpenChange` props threaded from a page down to a dialog.
- The component lives in the feature folder (`components/users/`), not in `shared/`,
  because it names a domain action.
- It exposes only what its parent needs to react to - an `onInvited` callback, or nothing.
  How it opens, closes and returns focus stays inside.
- shadcn's `Dialog`, `Sheet` and `Popover` are not vendored yet. The first one arrives
  through `shadcn add`, which brings a new runtime dependency, so confirm it first.

## Styling lives in shared components

A `className` full of Tailwind utilities belongs in `src/components/shared/` (and the
vendored `ui/`). Pages, layouts and feature components compose those and pass props, not
classes:

```tsx
// not this - src/app/(app)/page.tsx
<div className="flex flex-col gap-6 px-6 py-8">
  <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
  ...
</div>

// this
<PageShell>
  <PageHeader title="Invoices" />
  ...
</PageShell>
```

- When a page needs a look, reuse a shared component. If none fits, add one to `shared/`
  with a prop for the variation (`size`, `tone`), rather than writing the classes in place.
- A `className` in a page or feature file is the exception, kept for a one-off adjustment
  that no shared component or prop expresses. If a second file would write the same
  classes, it is a shared component.
- One look then changes in one file, and a page reads as structure rather than as a list
  of utilities. Fonts follow the stricter rule in `typography.md`: a family is set only in
  `globals.css`.

## A page uses the full width

A page spans the viewport. No layout or page caps itself with a centred `max-w-*` column
and leaves the sides empty.

- The page shell carries the one horizontal gutter and the full width, and it is a shared
  component, so every page gets the same edges.
- Wide content divides the width with a grid or columns rather than stacking narrow
  blocks down the middle.
- Check every page at a phone width and at a wide desktop width. It should fill both
  with no horizontal scroll.

## No wait looks stuck

The person waiting always sees that something is happening, and what.

- **Every page has a fallback loader.** Each route is covered by a `loading.tsx` - in its
  own folder or the nearest parent, such as `app/(app)/loading.tsx` - which Next wraps
  around the page as a Suspense fallback. It renders the shared `Loader` with a label
  naming what is loading ("Loading invoices"), never a bare spinner or a blank area.
- **Every client-side wait shows it immediately.** A query's `isPending` renders `Loader`
  in place of the content, as `AuthGate` does. A mutation either swaps its form for
  `Loader`, as `SignUpForm` does, or disables its trigger and shows a pending label
  ("Saving...") from the moment it is clicked. Either way, a click is never swallowed in
  silence.
- **A loader holds the space of what replaces it.** `Loader` has a fixed height for this
  reason, so the page does not jump when the wait ends. A wait in a space of another size
  gets a prop on `Loader`, per the styling rule above, not a `className` at the call site.
- A failure is a toast from the query client (`web-data-access.md`), so a wait always
  ends in either the content or a message - never in a loader that spins forever.
