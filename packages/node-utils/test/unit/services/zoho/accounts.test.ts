import { describe, expect, it } from "vitest";
import { ZohoAccounts } from "@/services/zoho/accounts";

const credentials = {
  accountsUrl: "https://accounts.example.com",
  clientId: "client-1",
  clientSecret: "secret-1",
};

describe("ZohoAccounts.consentUrl", () => {
  it("asks for offline access, so Zoho returns a refresh token", () => {
    const consentUrl = new URL(
      ZohoAccounts.consentUrl(
        credentials,
        ["ZohoCRM.modules.ALL", "ZohoCRM.users.READ"],
        "https://app.example.com/api/v1/zoho-token/callback",
        "1700000000000.signature",
      ),
    );

    expect(consentUrl.origin + consentUrl.pathname).toBe(
      "https://accounts.example.com/oauth/v2/auth",
    );
    expect([...consentUrl.searchParams]).toEqual([
      ["scope", "ZohoCRM.modules.ALL,ZohoCRM.users.READ"],
      ["client_id", "client-1"],
      ["response_type", "code"],
      ["access_type", "offline"],
      ["redirect_uri", "https://app.example.com/api/v1/zoho-token/callback"],
      ["state", "1700000000000.signature"],
    ]);
    expect(consentUrl.searchParams.has("client_secret")).toBe(false);
  });
});
