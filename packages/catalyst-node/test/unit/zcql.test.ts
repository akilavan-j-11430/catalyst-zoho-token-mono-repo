import { describe, expect, it, vi } from "vitest";
import { Zcql, type ZcqlRow, type ZcqlValue } from "@/zcql";
import { CatalystScope } from "@/catalyst-scope";
import { ErrorCode } from "@/error-codes";
import { CatalystError } from "@/catalyst-error";
import { inRequest } from "../in-request";

// The SDK is replaced before zcql.ts loads it, so no call leaves the process. vi.hoisted
// makes the spy exist by then, since vi.mock is hoisted above the imports.
const { executeZcqlQuery } = vi.hoisted(() => ({ executeZcqlQuery: vi.fn() }));

const { executeOlapQuery } = vi.hoisted(() => ({ executeOlapQuery: vi.fn() }));

vi.mock("@zcatalyst/datastore", () => ({
  Datastore: class {
    executeZCQLQuery = executeZcqlQuery;
    executeOLAPQuery = executeOlapQuery;
  },
}));

/** Runs the query the way a route would, inside the request's execution context. */
function queryAsUser(statement: string, values?: ZcqlValue[]): Promise<ZcqlRow[]> {
  return inRequest(() => Zcql.runIn(CatalystScope.User).executeQuery(statement, values));
}

/** The query text the SDK received for a statement and its values. */
async function sentFor(statement: string, values: ZcqlValue[]): Promise<unknown> {
  executeZcqlQuery.mockResolvedValue([]);
  await queryAsUser(statement, values);
  return executeZcqlQuery.mock.calls[0]?.[0];
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

  it("keeps the statement, and the values bound into it, out of the error", async () => {
    executeZcqlQuery.mockRejectedValue(new Error("ZCQL syntax error"));

    const querying = queryAsUser("SELECT * FROM Todo WHERE TITLE = ?", ["secret"]);

    await expect(querying).rejects.toSatisfy(
      (error: CatalystError) => !error.toString().includes("secret"),
    );
  });
});

describe("Zcql.executeOlapQuery", () => {
  it("binds its values and sends the query to the OLAP engine", async () => {
    executeOlapQuery.mockResolvedValue([]);

    const statement = "SELECT COUNT(ROWID) FROM Todo WHERE TITLE = ?";
    await inRequest(() => Zcql.runIn(CatalystScope.Admin).executeOlapQuery(statement, ["Pay"]));

    expect(executeOlapQuery).toHaveBeenCalledExactlyOnceWith(
      "SELECT COUNT(ROWID) FROM Todo WHERE TITLE = 'Pay'",
    );
    expect(executeZcqlQuery).not.toHaveBeenCalled();
  });

  it("turns an SDK failure into a CatalystError without the statement", async () => {
    executeOlapQuery.mockRejectedValue(new Error("OLAP engine unavailable"));

    const statement = "SELECT * FROM Todo WHERE TITLE = ?";
    const querying = inRequest(() =>
      Zcql.runIn(CatalystScope.Admin).executeOlapQuery(statement, ["secret"]),
    );

    await expect(querying).rejects.toMatchObject({ code: ErrorCode.INVALID_RESOURCE });
    await expect(querying).rejects.toSatisfy(
      (error: CatalystError) => !error.toString().includes("secret"),
    );
  });
});

describe("Zcql.executeQuery binding values", () => {
  it("puts each value where its ? is, a string quoted and a number as written", async () => {
    const sent = await sentFor("SELECT * FROM Todo WHERE TITLE = ? LIMIT 1, ?", ["Pay", 300]);

    expect(sent).toBe("SELECT * FROM Todo WHERE TITLE = 'Pay' LIMIT 1, 300");
  });

  it("doubles each quote in a string, so the value cannot close its literal", async () => {
    const sent = await sentFor("SELECT * FROM Todo WHERE TITLE = ?", ["' OR TITLE = 'x"]);

    expect(sent).toBe("SELECT * FROM Todo WHERE TITLE = ''' OR TITLE = ''x'");
  });

  it("leaves a backslash as it is - ZCQL treats it as an ordinary character", async () => {
    const sent = await sentFor("SELECT * FROM Todo WHERE TITLE = ?", ["back\\slash"]);

    expect(sent).toBe("SELECT * FROM Todo WHERE TITLE = 'back\\slash'");
  });

  it("puts null in as NULL, wherever the statement puts its ?", async () => {
    const sent = await sentFor("UPDATE Todo SET NOTES = ? WHERE TITLE = ?", [null, "Pay"]);

    expect(sent).toBe("UPDATE Todo SET NOTES = NULL WHERE TITLE = 'Pay'");
  });

  it("throws before any call when the values do not match the placeholders", async () => {
    await expect(queryAsUser("SELECT * FROM Todo WHERE TITLE = ?", [])).rejects.toMatchObject({
      code: ErrorCode.INVALID_RESOURCE,
    });
    expect(executeZcqlQuery).not.toHaveBeenCalled();
  });

  it("throws before any call for a number that is not finite", async () => {
    await expect(queryAsUser("SELECT * FROM Todo LIMIT ?", [Number.NaN])).rejects.toMatchObject({
      code: ErrorCode.INVALID_RESOURCE,
    });
    expect(executeZcqlQuery).not.toHaveBeenCalled();
  });
});
