import { describe, expect, it, vi } from "vitest";
import { Catalyst, type CatalystApp } from "@/catalyst/catalyst";
import { Zcql, type ZcqlRow } from "@/catalyst/zcql";
import { CatalystScope } from "@/enums/catalyst-scope";
import { ErrorCode } from "@/enums/error-codes";
import { CatalystError } from "@/errors/catalyst-error";
import { ExecutionContext, runWithContext } from "@/framework/async-context";

// The SDK is replaced before zcql.ts loads it, so no call leaves the process. vi.hoisted
// makes the spy exist by then, since vi.mock is hoisted above the imports.
const { executeZcqlQuery } = vi.hoisted(() => ({ executeZcqlQuery: vi.fn() }));

vi.mock("@zcatalyst/datastore", () => ({
  Datastore: class {
    executeZCQLQuery = executeZcqlQuery;
  },
}));

/** Runs the query the way a route would: inside a request whose User app is built. */
function queryAsUser(query: string): Promise<ZcqlRow[]> {
  const catalyst = new Catalyst();
  catalyst.setApp(CatalystScope.User, {} as CatalystApp);
  const context = new ExecutionContext({ executionId: "execution-1", catalyst, extras: {} });
  return runWithContext(context, () =>
    Zcql.runIn(CatalystScope.User).executeQuery(query),
  );
}

describe("Zcql.executeQuery", () => {
  it("sends the statement as written and keeps each table's columns under its name", async () => {
    const joinedRows = [{ Todo: { ROWID: "1", TITLE: "Pay" }, Owner: { ROWID: "9" } }];
    executeZcqlQuery.mockResolvedValue(joinedRows);

    const storedRows = await queryAsUser("SELECT * FROM Todo JOIN Owner");

    expect(executeZcqlQuery).toHaveBeenCalledExactlyOnceWith("SELECT * FROM Todo JOIN Owner");
    expect(storedRows).toEqual(joinedRows);
  });

  it("turns an SDK failure into a CatalystError", async () => {
    executeZcqlQuery.mockRejectedValue(new Error("ZCQL syntax error"));

    const querying = queryAsUser("SELEC * FROM Todo");

    await expect(querying).rejects.toBeInstanceOf(CatalystError);
    await expect(querying).rejects.toMatchObject({ code: ErrorCode.INVALID_RESOURCE });
  });
});
