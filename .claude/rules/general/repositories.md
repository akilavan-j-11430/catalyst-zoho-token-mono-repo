# Repositories

A repository (Repository pattern) loads and saves this app's records behind methods named for
the business - `TodoRepository.find(todoId)`, `ContactRepository.listByOwner(ownerId)`. Where
the records live is its own detail: a Data Store table today, Postgres or a CRM tomorrow.

Repositories live in their own package, `@repo/repositories` (`packages/repositories/src/`),
one class per aggregate, `<name>-repository.ts`. Not in `catalyst-node`: that package wraps the
SDK and would serve any Catalyst solution, while repositories are this solution's data model
and change with the product. The package also holds `resources.ts`, every Catalyst resource
handle this app declares (`catalyst-sdk.md`), since those are this solution's too. It depends
on `@repo/catalyst-node` and calls its wrappers, never `@zcatalyst/*`, and the web app, every
AppSail and every function import it, so none writes its own queries. It does not exist yet:
it arrives with the first resource.

Nothing else touches a table handle or `Zcql` - not a route, an area, a page or a job. ZCQL, column names and `ROWID`
are all Catalyst's, the deepest lock-in here, so they stay in one place: the table's
repository, the only code that imports that table's handle and names its columns. Moving to
Postgres then rewrites the repository and leaves every caller alone:

```ts
// packages/repositories/src/todo-repository.ts
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import type { StoredRow } from "@repo/catalyst-node/table";
import type { Todo } from "@repo/types/todo";
import { todoTable, type TodoRow } from "@/resources";

/** Repository: every Data Store read and write of todos, and the only code naming their columns. */
export class TodoRepository {
  /** A signed-in user opening one of their todos. */
  static async find(todoId: string): Promise<Todo | undefined> {
    const storedTodo = await todoTable.runIn(CatalystScope.User).getRow(todoId);
    return storedTodo && TodoRepository.toTodo(storedTodo);
  }

  /** Support looking up anyone's todo, from a function no signed-in user calls. */
  static async findForSupport(todoId: string): Promise<Todo | undefined> {
    const storedTodo = await todoTable.runIn(CatalystScope.Admin).getRow(todoId);
    return storedTodo && TodoRepository.toTodo(storedTodo);
  }

  private static toTodo(storedTodo: StoredRow<TodoRow>): Todo {
    return { todoId: storedTodo.ROWID, title: storedTodo.TITLE, notes: storedTodo.NOTES ?? undefined };
  }
}

// apps/web/src/app/(app)/todos/[todoId]/page.tsx
import { TodoRepository } from "@repo/repositories/todo-repository";

const todo = await TodoRepository.find(todoId);
```

## Which scope a method reads with

Each method picks its scope from the business case it serves, and its name says which case
that is. A signed-in user reading their own records is User, so the table's User
permissions decide what they see. Work no signed-in user starts - a job, an event, support
reading anyone's record - is Admin. The caller never passes a scope in.

- **Two cases, two methods,** even when the query is the same: `find` for the user,
  `findForSupport` for support. A method that served both would need the caller to choose,
  and then nothing in the repository says who may read what.
- **The entry point sets every scope the methods it calls read.** A page that calls `find`
  lists User in `withCatalystPage`; a job, which has only Admin, calls only Admin methods.
  A missing scope throws `SCOPE_UNAVAILABLE` at the call, never reads with another one.
- **Admin proves nothing about the caller.** An Admin method behind a public entry point is
  public, so the entry point that calls one checks who may - a Security Rule set to
  `required`, or User scope beside it.

An area calls a repository; a page, an action or a route calls one directly only while there
is no area in between (`nextjs/code-placement.md`, `node-api/code-placement.md`). Bucket,
cache and job handles need no repository - whatever needs one calls its wrapper directly -
but their handles live in `@repo/repositories`'s `resources.ts` too.

## An outside service: a repository or a client

Calling an outside service - a CRM, a payment provider, a mailer - is one of two things, and
the test is how you would say it:

| You would say | It is | Lives in |
|---|---|---|
| "the contacts", "the deals" - records this app treats as its own data, kept in the service | a **repository**, `ContactRepository`, built on `HttpClient`, mapping the service's fields to a domain type the way a table repository maps columns | `@repo/repositories`, beside the table repositories |
| "tell the CRM to..." - create a lead from a sign-up, start a workflow, send a campaign | a **client** for the service, a class named after it - `ZohoCrm.createLead(...)` - built on `HttpClient` | its own package, `packages/<service>/` (`packages/zoho-crm`), the one seam for that vendor |

Either way the service's casing, auth and errors stay inside it (`outbound-http.md`), and the
caller sees only domain types and `HttpRequestError`. A service used both ways gets both: the
repository for its records, the client for its actions, sharing one `HttpClient`.
