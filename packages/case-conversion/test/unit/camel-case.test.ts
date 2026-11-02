import { describe, expect, it } from "vitest";
import { CamelCase } from "@/camel-case";

describe("CamelCase.convertName", () => {
  it.each([
    ["user_id", "userId"],
    ["Next-Page-Token", "nextPageToken"],
    ["USER_ID", "userId"],
    ["ROWID", "rowid"],
    ["emailId", "emailId"],
  ])("converts %s to %s", (vendorName, camelName) => {
    expect(CamelCase.convertName(vendorName)).toBe(camelName);
  });
});

describe("CamelCase.convertKeys", () => {
  it("renames keys at every depth, inside arrays too", () => {
    const vendorRecord = {
      user_details: { email_id: "a@example.com", role_details: [{ role_name: "admin" }] },
    };

    expect(CamelCase.convertKeys(vendorRecord)).toEqual({
      userDetails: { emailId: "a@example.com", roleDetails: [{ roleName: "admin" }] },
    });
  });

  it("returns values that are not plain objects untouched", () => {
    const createdAt = new Date(0);

    expect(CamelCase.convertKeys({ created_at: createdAt })).toEqual({ createdAt });
    expect(CamelCase.convertKeys("user_id")).toBe("user_id");
  });
});
