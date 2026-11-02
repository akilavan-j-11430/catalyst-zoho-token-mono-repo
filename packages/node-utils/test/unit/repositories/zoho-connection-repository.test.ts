import { describe, expect, it, vi } from "vitest";
import { Catalyst, type CatalystApp } from "@/catalyst/catalyst";
import { CatalystScope } from "@/enums/catalyst-scope";
import { ExecutionContext, runWithContext } from "@/framework/async-context";
import { ZohoConnectionRepository } from "@/repositories/zoho-connection-repository";

// The SDK is replaced, so the real Zcql and Table wrappers run and no call leaves the
// process. `openDatastore` records which app each call was built from, which is how a test
// tells the User scope from the Admin one.
const { openDatastore, executeZcqlQuery, openTable, insertRow } = vi.hoisted(() => ({
  openDatastore: vi.fn<(app: CatalystApp) => void>(),
  executeZcqlQuery: vi.fn<(query: string) => Promise<object[]>>(),
  openTable: vi.fn<(tableName: string) => void>(),
  insertRow: vi.fn<(row: object) => Promise<object>>(),
}));

vi.mock("@zcatalyst/datastore", () => ({
  Datastore: class {
    constructor(app: CatalystApp) {
      openDatastore(app);
    }
    executeZCQLQuery = executeZcqlQuery;
    table(tableName: string): { insertRow: typeof insertRow } {
      openTable(tableName);
      return { insertRow };
    }
  },
}));

// Call assertions compare by value, so the two stand-ins must differ in content.
const userApp = { scope: "user" } as unknown as CatalystApp;
const adminApp = { scope: "admin" } as unknown as CatalystApp;

/** Runs a call the way a route would: inside a request with both apps built. */
function inRequest<T>(call: () => Promise<T>): Promise<T> {
  const catalyst = new Catalyst();
  catalyst.setApp(CatalystScope.User, userApp);
  catalyst.setApp(CatalystScope.Admin, adminApp);
  const context = new ExecutionContext({ executionId: "execution-1", catalyst, extras: {} });
  return runWithContext(context, call);
}

describe("ZohoConnectionRepository.findRefreshToken", () => {
  it("reads one row's token in the scope it is given", async () => {
    executeZcqlQuery.mockResolvedValue([{ ZohoConnection: { REFRESH_TOKEN: "refresh-1" } }]);

    const refreshToken = await inRequest(() =>
      ZohoConnectionRepository.findRefreshToken("7", CatalystScope.User),
    );

    expect(refreshToken).toBe("refresh-1");
    expect(executeZcqlQuery).toHaveBeenCalledExactlyOnceWith(
      "SELECT REFRESH_TOKEN FROM ZohoConnection WHERE REFERENCE_ID = '7' LIMIT 1",
    );
    expect(openDatastore).toHaveBeenCalledExactlyOnceWith(userApp);
  });

  it("reads as Admin when a job asks", async () => {
    executeZcqlQuery.mockResolvedValue([]);

    await inRequest(() => ZohoConnectionRepository.findRefreshToken("7", CatalystScope.Admin));

    expect(openDatastore).toHaveBeenCalledExactlyOnceWith(adminApp);
  });

  it("answers undefined when the user has no grant", async () => {
    executeZcqlQuery.mockResolvedValue([]);

    const refreshToken = await inRequest(() =>
      ZohoConnectionRepository.findRefreshToken("7", CatalystScope.User),
    );

    expect(refreshToken).toBeUndefined();
  });
});

describe("ZohoConnectionRepository.exists", () => {
  it("selects only the ROWID and answers true for a stored row", async () => {
    executeZcqlQuery.mockResolvedValue([{ ZohoConnection: { ROWID: "3" } }]);

    const exists = await inRequest(() => ZohoConnectionRepository.exists("7", CatalystScope.User));

    expect(exists).toBe(true);
    expect(executeZcqlQuery).toHaveBeenCalledExactlyOnceWith(
      "SELECT ROWID FROM ZohoConnection WHERE REFERENCE_ID = '7' LIMIT 1",
    );
    expect(openDatastore).toHaveBeenCalledExactlyOnceWith(userApp);
  });

  it("answers false when no row matches", async () => {
    executeZcqlQuery.mockResolvedValue([]);

    const exists = await inRequest(() => ZohoConnectionRepository.exists("7", CatalystScope.User));

    expect(exists).toBe(false);
  });
});

describe("ZohoConnectionRepository writes", () => {
  it("inserts as the user, whose credentials alone can read the row back", async () => {
    await inRequest(() => ZohoConnectionRepository.insert("7", "refresh-1"));

    expect(openDatastore).toHaveBeenCalledExactlyOnceWith(userApp);
    expect(openTable).toHaveBeenCalledExactlyOnceWith("ZohoConnection");
    expect(insertRow).toHaveBeenCalledExactlyOnceWith({
      REFERENCE_ID: "7",
      REFRESH_TOKEN: "refresh-1",
    });
  });

  it("deletes as Admin in one statement by reference id", async () => {
    executeZcqlQuery.mockResolvedValue([]);

    await inRequest(() => ZohoConnectionRepository.deleteByReferenceId("7"));

    expect(openDatastore).toHaveBeenCalledExactlyOnceWith(adminApp);
    expect(executeZcqlQuery).toHaveBeenCalledExactlyOnceWith(
      "DELETE FROM ZohoConnection WHERE REFERENCE_ID = '7'",
    );
  });
});
