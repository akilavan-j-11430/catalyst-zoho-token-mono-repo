import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserManagement } from "@repo/node-utils/catalyst/user-management";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { CatalystError } from "@repo/node-utils/errors/catalyst-error";
import { ZohoAuthError, ZohoAuthErrorCode } from "@repo/node-utils/errors/zoho-auth-error";
import type { ZohoConnection } from "@repo/node-utils/services/zoho/connection";
import { ApiPath } from "@repo/routing/api-path";
import { catalystAuth } from "@repo/testing/catalyst-auth";
import { app } from "@/app";

// `zcAuth.init` is faked for the whole workspace by test/setup.ts. The connection and the
// caller lookup are faked here, so no request reaches Catalyst or Zoho.
const { connection, currentUser } = vi.hoisted(() => ({
  connection: {
    isConnected: vi.fn<ZohoConnection["isConnected"]>(),
    consentUrl: vi.fn<ZohoConnection["consentUrl"]>(),
    persistToken: vi.fn<ZohoConnection["persistToken"]>(),
    disconnect: vi.fn<ZohoConnection["disconnect"]>(),
  },
  currentUser: vi.fn<typeof UserManagement.currentUser>(),
}));

vi.mock("@/zoho-connections", () => ({ userZohoConnection: connection }));
vi.mock("@repo/node-utils/catalyst/user-management", () => ({
  UserManagement: { currentUser },
}));

const ZOHO_TOKEN = ApiPath.Api + ApiPath.V1 + ApiPath.ZohoToken;
const CALLBACK_URI = "https://app.example.com/api/v1/zoho-token/callback";
const WEB_HOME = "https://web.example.com/";
const CONSENT_URL = "https://accounts.example.com/oauth/v2/auth?state=1.signature";

beforeEach(() => {
  vi.stubEnv("ZOHO_TOKEN_SCOPES", " ZohoCRM.modules.ALL, ZohoCRM.users.READ ,");
  vi.stubEnv("ZOHO_TOKEN_CALLBACK_ORIGIN", "https://app.example.com");
  vi.stubEnv("WEB_APP_ORIGIN", "https://web.example.com");
});

describe("GET /api/v1/zoho-token/connect", () => {
  it("sends a user who is not connected to Zoho's consent screen", async () => {
    connection.isConnected.mockResolvedValue(false);
    connection.consentUrl.mockResolvedValue(CONSENT_URL);

    const consent = await request(app).get(ZOHO_TOKEN + ApiPath.Connect);

    expect(consent.status).toBe(302);
    expect(consent.headers["location"]).toBe(CONSENT_URL);
    expect(connection.consentUrl).toHaveBeenCalledExactlyOnceWith(
      ["ZohoCRM.modules.ALL", "ZohoCRM.users.READ"],
      CALLBACK_URI,
    );
  });

  it("sends a connected user home", async () => {
    connection.isConnected.mockResolvedValue(true);

    const home = await request(app).get(ZOHO_TOKEN + ApiPath.Connect);

    expect(home.status).toBe(302);
    expect(home.headers["location"]).toBe(WEB_HOME);
    expect(connection.consentUrl).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/zoho-token/callback", () => {
  it("stores the grant and sends the user home", async () => {
    const home = await request(app)
      .get(ZOHO_TOKEN + ApiPath.Callback)
      .query({ code: "code-1", state: "1.signature" });

    expect(home.status).toBe(302);
    expect(home.headers["location"]).toBe(WEB_HOME);
    expect(connection.persistToken).toHaveBeenCalledExactlyOnceWith(
      "code-1",
      "1.signature",
      CALLBACK_URI,
    );
  });

  it("sends a user who denied consent home without storing anything", async () => {
    const home = await request(app)
      .get(ZOHO_TOKEN + ApiPath.Callback)
      .query({ error: "access_denied" });

    expect(home.status).toBe(302);
    expect(home.headers["location"]).toBe(WEB_HOME);
    expect(connection.persistToken).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/zoho-token/callback failures", () => {
  it("answers 400 when the code is missing", async () => {
    const rejection = await request(app)
      .get(ZOHO_TOKEN + ApiPath.Callback)
      .query({ state: "1.signature" });

    expect(rejection.status).toBe(400);
    expect(rejection.body).toEqual({ status: "error", message: "code is required." });
    expect(connection.persistToken).not.toHaveBeenCalled();
  });

  it("answers 400 when the state is missing", async () => {
    const rejection = await request(app)
      .get(ZOHO_TOKEN + ApiPath.Callback)
      .query({ code: "code-1" });

    expect(rejection.status).toBe(400);
    expect(rejection.body).toEqual({ status: "error", message: "state is required." });
    expect(connection.persistToken).not.toHaveBeenCalled();
  });

  it.each([
    ["the state does not match", ZohoAuthErrorCode.StateMismatch],
    ["Zoho rejects the grant code", ZohoAuthErrorCode.InvalidGrantCode],
  ])("answers 400 when %s, so the user starts again", async (_case, code) => {
    connection.persistToken.mockRejectedValue(new ZohoAuthError(code, code));

    const rejection = await request(app)
      .get(ZOHO_TOKEN + ApiPath.Callback)
      .query({ code: "code-1", state: "1.signature" });

    expect(rejection.status).toBe(400);
    expect(rejection.body).toEqual({
      status: "error",
      message: "Zoho consent did not complete. Start the process again.",
    });
  });

  it("answers 500 when Zoho rejects the client itself", async () => {
    connection.persistToken.mockRejectedValue(
      new ZohoAuthError("invalid_client", "Zoho refused the token request: invalid_client"),
    );

    const failure = await request(app)
      .get(ZOHO_TOKEN + ApiPath.Callback)
      .query({ code: "code-1", state: "1.signature" });

    expect(failure.status).toBe(500);
    expect(failure.body).toEqual({ status: "error", message: "Something went wrong." });
  });
});

describe("GET /api/v1/zoho-token/status", () => {
  it("answers whether the caller is connected", async () => {
    connection.isConnected.mockResolvedValue(true);

    const status = await request(app).get(ZOHO_TOKEN + ApiPath.Status);

    expect(status.status).toBe(200);
    expect(status.body).toEqual({ status: "success", data: { connected: true } });
  });
});

describe("POST /api/v1/zoho-token/disconnect", () => {
  it("disconnects and answers not connected", async () => {
    const disconnection = await request(app).post(ZOHO_TOKEN + ApiPath.Disconnect);

    expect(disconnection.status).toBe(200);
    expect(disconnection.body).toEqual({ status: "success", data: { connected: false } });
    expect(connection.disconnect).toHaveBeenCalledOnce();
  });
});

describe("zoho-token routes without an app user", () => {
  it("answers 401 before any handler runs, having built both scopes", async () => {
    currentUser.mockRejectedValue(CatalystError.ResourceNotFound("No app user for this caller"));

    const rejection = await request(app).get(ZOHO_TOKEN + ApiPath.Status);

    expect(rejection.status).toBe(401);
    expect(rejection.body).toEqual({ status: "error", message: "Sign in to continue." });
    expect(connection.isConnected).not.toHaveBeenCalled();
    expect(catalystAuth.init).toHaveBeenCalledTimes(2);
    expect(catalystAuth.init).toHaveBeenCalledWith(expect.anything(), {
      scope: CatalystScope.User,
    });
    expect(catalystAuth.init).toHaveBeenCalledWith(expect.anything(), {
      scope: CatalystScope.Admin,
    });
  });

  it("answers 500 when the caller lookup fails for another reason", async () => {
    currentUser.mockRejectedValue(new Error("socket hang up"));

    const failure = await request(app).get(ZOHO_TOKEN + ApiPath.Status);

    expect(failure.status).toBe(500);
    expect(failure.body).toEqual({ status: "error", message: "Something went wrong." });
    expect(connection.isConnected).not.toHaveBeenCalled();
  });
});
