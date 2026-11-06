import { UserManagement as UserManagementClient } from "@zcatalyst/auth";
import { CamelCase } from "@repo/case-conversion/camel-case";
import type { CurrentUser, NewUser, RegisteredUser } from "@repo/types/user";
import { CatalystScope } from "@/enums/catalyst-scope";
import { CatalystError } from "@/errors/catalyst-error";
import { currentContext } from "@/framework/async-context";

type RegisteredUserDetails = Awaited<
  ReturnType<UserManagementClient["registerUser"]>
>["user_details"];

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope. */
function userManagement(scope: CatalystScope): UserManagementClient {
  return new UserManagementClient(currentContext().manager.catalyst.getApp(scope));
}

/** Picks only the fields we expose, so the rest of Catalyst's user record never leaks. */
function toRegisteredUser(details: RegisteredUserDetails): RegisteredUser {
  const { userId, emailId, firstName, lastName, isConfirmed } = CamelCase.convertKeys(details);
  return { userId, emailId, firstName, lastName, isConfirmed };
}

/** Catalyst app users. Like `Zcql`, this names no resource, so it has no handle. */
export class UserManagement {
  /** Where the caller is memoized for the rest of the request, alongside `req.startTime`. */
  private static readonly CALLER_KEY = "catalyst.currentUser";

  /** Registers an app user. Catalyst emails them a link to confirm and set a
   *  password, and sends them to `redirectUrl` from it. */
  static async register(
    user: NewUser,
    redirectUrl: string,
  ): Promise<RegisteredUser> {
    try {
      // Admin, because registering a user is not a browser SDK method and its caller has
      // no account yet.
      const registered = await userManagement(CatalystScope.Admin).registerUser(
        {
          platform_type: "web",
          redirect_url: redirectUrl,
        },
        {
          first_name: user.firstName,
          last_name: user.lastName,
          email_id: user.emailId,
        },
      );
      return toRegisteredUser(registered.user_details);
    } catch (cause) {
      throw CatalystError.InvalidResource(
        `Failed to register ${user.emailId}`,
        cause,
      );
    }
  }

  /** The app user the request is signed in as.
   *
   *  Memoized on the execution context, because several handlers ask who is calling
   *  within one request and the answer cannot change midway. The context is built per
   *  request, so one caller's identity is never visible to another. */
  static async currentUser(): Promise<CurrentUser> {
    const execution = currentContext().manager;
    const known = execution.getExtras<CurrentUser>(UserManagement.CALLER_KEY);
    if (known !== undefined) {
      return known;
    }
    const caller = await UserManagement.fetchCurrentUser();
    execution.setExtras(UserManagement.CALLER_KEY, caller);
    return caller;
  }

  /** User scope, because only the caller's own credentials say who they are - an Admin app
   *  has no user behind it. */
  private static async fetchCurrentUser(): Promise<CurrentUser> {
    try {
      const catalystUser = await userManagement(CatalystScope.User).getCurrentUser();
      const { userId, emailId, firstName, lastName } = CamelCase.convertKeys(catalystUser);
      return { userId, emailId, firstName, lastName };
    } catch (cause) {
      throw CatalystError.InvalidResource("Failed to read the signed-in user", cause);
    }
  }
}
