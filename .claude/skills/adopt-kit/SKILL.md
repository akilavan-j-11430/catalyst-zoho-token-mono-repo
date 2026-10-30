---
name: adopt-kit
description: Turn a fresh clone of catalyst-zoho-token-mono-repo into a named solution - rename it everywhere the kit names itself and drop the starter-kit wording. Run once, right after cloning.
disable-model-invocation: true
---

# adopt-kit

Run this in a fresh clone of `catalyst-zoho-token-mono-repo`, once, before any other change.
It renames the clone and removes the "starter kit" wording. It does not touch the deploy
surface, the Zoho connection, the domain, or the design.

## Inputs

All four are required. Stop and ask if one is missing; never invent one.

| Input | Example |
|---|---|
| `repoName` - kebab-case | `visit-log` |
| `title` - display name | `Visit Log` |
| `description` - one sentence, ends with a full stop | `Field reps log customer visits straight into Zoho CRM.` |
| `kitSha` - short SHA of the kit commit that was cloned | `1a7dc4d` |

## Edits

Make each edit below. Each "Current text" is what the kit ships; if it no longer
matches, the kit has changed - find the equivalent spot instead of skipping it.

| File | Current text | New text |
|---|---|---|
| `package.json` | `"name": "catalyst-zoho-token-mono-repo"` | `"name": "<repoName>"` |
| `.claude/CLAUDE.md` line 1 | `# catalyst-zoho-token-mono-repo` | `# <title>` |
| `.claude/CLAUDE.md` lines 3-4 | `The basic Catalyst monorepo plus a Zoho OAuth connection. pnpm workspaces + Turborepo.` / `Clone, run \`catalyst init\` to bind it to your own Catalyst project, then build.` | `<description> pnpm workspaces + Turborepo, with a Zoho OAuth connection.` / `Started from catalyst-zoho-token-mono-repo@<kitSha>. Run \`catalyst init\` once per checkout to bind it to the Catalyst project.` |
| `.claude/CLAUDE.md` | `The repo carries exactly one feature: a Zoho OAuth connection,` | `The repo starts with one feature: a Zoho OAuth connection,` |
| `.claude/CLAUDE.md` | the paragraph starting `Everything else is still bare plumbing, so most other tasks mean adding the *first*` | `Extend the shape that is already here instead of introducing a second one; "Adding to the repo" below is the checklist for each kind.` |
| `README.md` line 1 | `# catalyst-zoho-token-mono-repo` | `# <title>` |
| `README.md` | the intro paragraph starting `A monorepo starter kit for building customer solutions` | `<description>` on its own line, then a blank line, then `Started from [catalyst-zoho-token-mono-repo](https://github.com/akilavan-j-11430/catalyst-zoho-token-mono-repo) at \`<kitSha>\`.` |
| `README.md` | `**What you get out of the box**` | `**What the stack gives you**` |
| `README.md` | the paragraph starting `It is deliberately small. Beyond the Zoho connection there is no domain layer` | delete it |
| `README.md` | under `## Make it yours`: the line `This is a template. When you start a real solution:` and the `**Rename the project.**` paragraph | delete both, and rename the heading to `## Changing the shape` |
| `apps/web/README.md` line 3 | `Next.js frontend for the Catalyst monorepo starter kit.` | `Next.js frontend for <title>.` |
| `apps/web/src/app/layout.tsx` `metadata` | `"Catalyst App"`, `"%s \| Catalyst App"`, `"A Catalyst starter app."` | `"<title>"`, `"%s \| <title>"`, `"<description>"` |

## Leave alone

- `catalyst.json` app names `api`, `web`, `proxy` - the deploy surface. They must match the
  Catalyst Console, each app's `scripts/bundle.mjs` output and the `--only` flags in the root
  `deploy` script.
- The `@repo/*` package scope and the workspace names `api`, `web`, `proxy` - turbo filters
  and scripts use them.
- Everything under `zoho-token` (routes, services, the `ZohoConnection` table name, env keys).
- `.catalystrc` - written by `catalyst init` for each developer.
- The generic phrase "Catalyst app" in code comments - it means a Catalyst SDK app instance,
  not the kit.

## Sweep

```bash
rg -n -i --hidden -g '!node_modules' -g '!pnpm-lock.yaml' -g '!.git' -g '!.claude/skills/adopt-kit' \
  'zoho-token-mono-repo|starter kit|starter app|Catalyst App"|this is a template'
```

The only allowed hit is the `Started from catalyst-zoho-token-mono-repo` line in `README.md`
and `.claude/CLAUDE.md`. `appsails/` is gitignored build output and is regenerated, so `rg`
skipping it is correct.

## Finish

Delete this skill's folder, `.claude/skills/adopt-kit/`, and `.claude/skills/` if it is now
empty. A finished solution has no use for it.
