import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accountsHttpCode, ZohoAuthError, ZohoAuthErrorCode } from "@/errors/zoho-auth-error";
import { ZohoAccounts, type ZohoCredentials } from "@/services/zoho/accounts";

interface ZohoAnswer {
  status: number;
  contentType: string;
  body: string;
}

interface ReceivedRequest {
  path: string | undefined;
  contentType: string | undefined;
  form: URLSearchParams;
}

function jsonAnswer(body: string): ZohoAnswer {
  return { status: 200, contentType: "application/json", body };
}

/** What the fake accounts server answers, keyed by the grant code, refresh token or token
 *  to revoke that the request carries. Zoho refuses a grant with a 200 and an `error` key. */
const zohoAnswers: Record<string, ZohoAnswer> = {
  "valid-code": jsonAnswer('{"access_token":"access-1","refresh_token":"refresh-1","expires_in":3600}'),
  "used-code": jsonAnswer('{"error":"invalid_code"}'),
  "online-only-code": jsonAnswer('{"access_token":"access-1","expires_in":3600}'),
  "refresh-1": jsonAnswer('{"access_token":"access-2"}'),
  "refresh-empty": jsonAnswer("{}"),
  "refresh-maintenance": { status: 200, contentType: "text/html", body: "<h1>Maintenance</h1>" },
  "revoked-token": { status: 400, contentType: "application/json", body: '{"error":"invalid_token"}' },
};

const receivedRequests: ReceivedRequest[] = [];

// A real accounts server on a free local port, so requests go through the real HttpClient
// and fetch transport.
const accountsServer = createServer(async (request, response) => {
  let rawBody = "";
  for await (const chunk of request) {
    rawBody += String(chunk);
  }
  const form = new URLSearchParams(rawBody);
  receivedRequests.push({ path: request.url, contentType: request.headers["content-type"], form });
  const grantKey = form.get("code") ?? form.get("refresh_token") ?? form.get("token") ?? "";
  const answer = zohoAnswers[grantKey] ?? jsonAnswer("{}");
  response.writeHead(answer.status, { "content-type": answer.contentType });
  response.end(answer.body);
});

let credentials: ZohoCredentials;

beforeAll(async () => {
  accountsServer.listen(0, "127.0.0.1");
  await once(accountsServer, "listening");
  const { port } = accountsServer.address() as AddressInfo;
  credentials = {
    accountsUrl: `http://127.0.0.1:${port}`,
    clientId: "client-1",
    clientSecret: "secret-1",
  };
});

afterAll(() => {
  accountsServer.closeAllConnections();
  accountsServer.close();
});

const REDIRECT_URI = "https://app.example.com/api/v1/zoho-token/callback";

describe("ZohoAccounts over a real connection", () => {
  it("exchanges a grant code as a form post carrying the client credentials", async () => {
    const grant = await ZohoAccounts.exchangeCode(credentials, "valid-code", REDIRECT_URI);

    expect(grant).toEqual({
      refreshToken: "refresh-1",
      accessToken: "access-1",
      expiresInSeconds: 3600,
    });
    const exchange = receivedRequests.at(-1);
    expect(exchange?.path).toBe("/oauth/v2/token");
    expect(exchange?.contentType).toMatch(/^application\/x-www-form-urlencoded/);
    expect([...(exchange?.form ?? [])]).toEqual([
      ["grant_type", "authorization_code"],
      ["code", "valid-code"],
      ["redirect_uri", REDIRECT_URI],
      ["client_id", "client-1"],
      ["client_secret", "secret-1"],
    ]);
  });

  it("refreshes an access token, assuming an hour when Zoho names no expiry", async () => {
    const accessToken = await ZohoAccounts.refresh(credentials, "refresh-1");

    expect(accessToken).toEqual({ accessToken: "access-2", expiresInSeconds: 3600 });
  });

  it("revokes with the token in the body, never in the logged url", async () => {
    await ZohoAccounts.revoke(credentials, "refresh-1");

    const revocation = receivedRequests.at(-1);
    expect(revocation?.path).toBe("/oauth/v2/token/revoke");
    expect(revocation?.form.get("token")).toBe("refresh-1");
  });
});

describe("ZohoAccounts failures over a real connection", () => {
  it.each([
    ["a used grant code", () => ZohoAccounts.exchangeCode(credentials, "used-code", REDIRECT_URI), ZohoAuthErrorCode.InvalidGrantCode],
    ["a grant without a refresh token", () => ZohoAccounts.exchangeCode(credentials, "online-only-code", REDIRECT_URI), ZohoAuthErrorCode.MissingRefreshToken],
    ["a refresh without an access token", () => ZohoAccounts.refresh(credentials, "refresh-empty"), ZohoAuthErrorCode.MissingAccessToken],
    ["a 200 that is not JSON", () => ZohoAccounts.refresh(credentials, "refresh-maintenance"), ZohoAuthErrorCode.UnreadableResponse],
    ["a revoke Zoho answers with 400", () => ZohoAccounts.revoke(credentials, "revoked-token"), accountsHttpCode(400)],
  ])("rejects %s with its code", async (_case, request, code) => {
    const requesting = request();

    await expect(requesting).rejects.toBeInstanceOf(ZohoAuthError);
    await expect(requesting).rejects.toMatchObject({ code });
  });

  it("rejects an unreachable accounts server as unreachable", async () => {
    // A port that was just freed refuses at once, where a fixed one might be filtered and
    // only fail on the client timeout.
    const closedServer = createServer();
    closedServer.listen(0, "127.0.0.1");
    await once(closedServer, "listening");
    const { port } = closedServer.address() as AddressInfo;
    closedServer.close();
    await once(closedServer, "close");
    const closedPort = { ...credentials, accountsUrl: `http://127.0.0.1:${port}` };

    await expect(ZohoAccounts.refresh(closedPort, "refresh-1")).rejects.toMatchObject({
      code: ZohoAuthErrorCode.AccountsUnreachable,
    });
  });
});
