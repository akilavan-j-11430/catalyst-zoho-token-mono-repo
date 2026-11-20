import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import type { ScopedTable } from "@repo/catalyst-node/table";
import { Zcql, type ScopedZcql, type ZcqlRow, type ZcqlValue } from "@repo/catalyst-node/zcql";
import { zohoConnectionTable, type ZohoConnectionRow } from "@/resources";
import { ZohoConnectionRepository } from "@/zoho-connection-repository";

// The wrappers are spied on rather than the SDK, so each test sees the scope a method
// chose and the statement it sent, and nothing reaches Catalyst.
const executeQuery = vi.fn<(statement: string, values: ZcqlValue[]) => Promise<ZcqlRow[]>>();
const insertRow = vi.fn<(row: ZohoConnectionRow) => Promise<object>>();
const zcqlIn = vi.spyOn(Zcql, "runIn");
const tableIn = vi.spyOn(zohoConnectionTable, "runIn");

beforeEach(() => {
  zcqlIn.mockReturnValue({ executeQuery } as unknown as ScopedZcql);
  tableIn.mockReturnValue({ insertRow } as unknown as ScopedTable<ZohoConnectionRow>);
});

describe("ZohoConnectionRepository.findRefreshToken", () => {
  it("reads the signed-in user's token as User, with the id bound", async () => {
    executeQuery.mockResolvedValue([{ ZohoConnection: { REFRESH_TOKEN: "refresh-1" } }]);

    const refreshToken = await ZohoConnectionRepository.findRefreshToken("7");

    expect(refreshToken).toBe("refresh-1");
    expect(zcqlIn).toHaveBeenCalledExactlyOnceWith(CatalystScope.User);
    expect(executeQuery).toHaveBeenCalledExactlyOnceWith(
      "SELECT REFRESH_TOKEN FROM ZohoConnection WHERE REFERENCE_ID = ? LIMIT 1",
      ["7"],
    );
  });

  it("answers undefined when the user has no grant", async () => {
    executeQuery.mockResolvedValue([]);

    const refreshToken = await ZohoConnectionRepository.findRefreshToken("7");

    expect(refreshToken).toBeUndefined();
  });
});

describe("ZohoConnectionRepository.findRefreshTokenForJob", () => {
  it("reads as Admin, since a job has no signed-in user", async () => {
    executeQuery.mockResolvedValue([{ ZohoConnection: { REFRESH_TOKEN: "refresh-1" } }]);

    const refreshToken = await ZohoConnectionRepository.findRefreshTokenForJob("7");

    expect(refreshToken).toBe("refresh-1");
    expect(zcqlIn).toHaveBeenCalledExactlyOnceWith(CatalystScope.Admin);
  });
});

describe("ZohoConnectionRepository.exists", () => {
  it("selects only the ROWID, as User, and answers true for a stored row", async () => {
    executeQuery.mockResolvedValue([{ ZohoConnection: { ROWID: "3" } }]);

    const exists = await ZohoConnectionRepository.exists("7");

    expect(exists).toBe(true);
    expect(zcqlIn).toHaveBeenCalledExactlyOnceWith(CatalystScope.User);
    expect(executeQuery).toHaveBeenCalledExactlyOnceWith(
      "SELECT ROWID FROM ZohoConnection WHERE REFERENCE_ID = ? LIMIT 1",
      ["7"],
    );
  });

  it("answers false when no row matches", async () => {
    executeQuery.mockResolvedValue([]);

    const exists = await ZohoConnectionRepository.exists("7");

    expect(exists).toBe(false);
  });
});

describe("ZohoConnectionRepository writes", () => {
  it("inserts as the user, whose credentials alone can read the row back", async () => {
    insertRow.mockResolvedValue({});

    await ZohoConnectionRepository.insert("7", "refresh-1");

    expect(tableIn).toHaveBeenCalledExactlyOnceWith(CatalystScope.User);
    expect(insertRow).toHaveBeenCalledExactlyOnceWith({
      REFERENCE_ID: "7",
      REFRESH_TOKEN: "refresh-1",
    });
  });

  it("deletes as Admin in one statement by reference id", async () => {
    executeQuery.mockResolvedValue([]);

    await ZohoConnectionRepository.deleteByReferenceId("7");

    expect(zcqlIn).toHaveBeenCalledExactlyOnceWith(CatalystScope.Admin);
    expect(executeQuery).toHaveBeenCalledExactlyOnceWith(
      "DELETE FROM ZohoConnection WHERE REFERENCE_ID = ?",
      ["7"],
    );
  });
});
