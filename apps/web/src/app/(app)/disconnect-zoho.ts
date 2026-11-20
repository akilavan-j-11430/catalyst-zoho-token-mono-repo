"use server";

import { revalidatePath } from "next/cache";
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { withCatalystFn } from "@/execution-context";
import { WebPath } from "@/web-path";
import { ZohoConnections } from "@/zoho-connections";

/** Revokes the signed-in user's grant at Zoho and deletes it here. User for the caller and
 *  their grant row, Admin for Catalyst Cache and the delete. */
export const disconnectZoho = withCatalystFn(
  [CatalystScope.User, CatalystScope.Admin],
  async (): Promise<void> => {
    await ZohoConnections.user().disconnect();
    revalidatePath(WebPath.Home);
  },
);
