import { describe, expect, it, vi } from "vitest";
import { Table } from "@/table";
import { CatalystScope } from "@/catalyst-scope";
import { ErrorCode } from "@/error-codes";
import { inRequest } from "../in-request";

const { getRow } = vi.hoisted(() => ({ getRow: vi.fn() }));

vi.mock("@zcatalyst/datastore", () => ({
  Datastore: class {
    table = (): { getRow: typeof getRow } => ({ getRow });
  },
}));

interface TodoRow {
  TITLE: string;
}

const todoTable = Table.create<TodoRow>("Todo");

function findTodo(rowId: string): Promise<unknown> {
  return inRequest(() => todoTable.runIn(CatalystScope.User).getRow(rowId));
}

describe("ScopedTable.getRow", () => {
  it("returns the stored row", async () => {
    const storedTodo = { ROWID: "1", TITLE: "Pay" };
    getRow.mockResolvedValue(storedTodo);

    await expect(findTodo("1")).resolves.toEqual(storedTodo);
  });

  it("returns undefined for a missing row, which Catalyst answers with null", async () => {
    getRow.mockResolvedValue(null);

    await expect(findTodo("1")).resolves.toBeUndefined();
  });

  it("returns undefined without a call for a ROWID that is not a number", async () => {
    await expect(findTodo("not-a-rowid")).resolves.toBeUndefined();
    expect(getRow).not.toHaveBeenCalled();
  });

  it("throws a CatalystError for any rejection - a missing table, a permission, an outage", async () => {
    getRow.mockRejectedValue({
      statusCode: 404,
      code: "INVALID_ID",
      message: "No such resource with the given id exists",
    });

    await expect(findTodo("1")).rejects.toMatchObject({ code: ErrorCode.INVALID_RESOURCE });
  });
});
