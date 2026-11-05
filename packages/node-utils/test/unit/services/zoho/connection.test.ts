import { describe, expect, it, vi } from "vitest";
import { Catalyst } from "@/catalyst/catalyst";
import type { zohoConnectionCache } from "@/catalyst/resources";
import type { UserManagement } from "@/catalyst/user-management";
import { CatalystScope } from "@/enums/catalyst-scope";
import {
  accountsHttpCode,
  ZohoAuthError,
  ZohoAuthErrorCode,
} from "@/errors/zoho-auth-error";
import { ExecutionContext, runWithContext } from "@/framework/async-context";
import type { ZohoConnectionRepository } from "@/repositories/zoho-connection-repository";
import type { ZohoAccounts } from "@/services/zoho/accounts";
import {
  currentUserGrant,
  userSpecificGrant,
  ZohoConnection,
} from "@/services/zoho/connection";

// Everything the connection calls one level down is faked, so no test reaches the Data
// Store, Catalyst Cache or Zoho. The specifiers match connection.ts's own imports.
const { repository, cache, accounts, currentUser } = vi.hoisted(() => ({
  repository: {
    findRefreshToken: vi.fn<typeof ZohoConnectionRepository.findRefreshToken>(),
    exists: vi.fn<typeof ZohoConnectionRepository.exists>(),
    insert: vi.fn<typeof ZohoConnectionRepository.insert>(),
    deleteByReferenceId: vi.fn<typeof ZohoConnectionRepository.deleteByReferenceId>(),
  },
  cache: {
    getValue: vi.fn<typeof zohoConnectionCache.getValue>(),
    putValue: vi.fn<typeof zohoConnectionCache.putValue>(),
    deleteValue: vi.fn<typeof zohoConnectionCache.deleteValue>(),
  },
  accounts: {
    consentUrl: vi.fn<typeof ZohoAccounts.consentUrl>(),
    exchangeCode: vi.fn<typeof ZohoAccounts.exchangeCode>(),
    refresh: vi.fn<typeof ZohoAccounts.refresh>(),
    revoke: vi.fn<typeof ZohoAccounts.revoke>(),
  },
  currentUser: vi.fn<typeof UserManagement.currentUser>(),
}));

vi.mock("@/repositories/zoho-connection-repository", () => ({
  ZohoConnectionRepository: repository,
}));
vi.mock("@/catalyst/resources", () => ({ zohoConnectionCache: cache }));
vi.mock("@/services/zoho/accounts", () => ({ ZohoAccounts: accounts }));
vi.mock("@/catalyst/user-management", () => ({ UserManagement: { currentUser } }));

const credentials = {
  accountsUrl: "https://accounts.example.com",
  clientId: "client-1",
  clientSecret: "secret-1",
};
const REDIRECT_URI = "https://app.example.com/api/v1/zoho-token/callback";
const ONE_HOUR_MS = 3_600_000;

// The connection's token caches and grant locks are module-level and outlive a test, so
// every test acts for a user of its own.
let lastReferenceId = 1000;
function newReferenceId(): string {
  lastReferenceId += 1;
  return String(lastReferenceId);
}

/** Runs a call the way a request would: inside its own execution context. */
function inExecution<T>(call: () => Promise<T>): Promise<T> {
  const context = new ExecutionContext({
    executionId: "execution-1",
    catalyst: new Catalyst(),
    extras: {},
  });
  return runWithContext(context, call);
}

function connectionFor(referenceId: string): ZohoConnection {
  return ZohoConnection.create(credentials, userSpecificGrant(referenceId));
}

function rejectedGrant(): ZohoAuthError {
  return new ZohoAuthError(ZohoAuthErrorCode.InvalidGrantCode, "invalid_code");
}

/** The state the connection put on the consent url it built for this user. */
async function issueConsentState(connection: ZohoConnection): Promise<string> {
  await inExecution(() => connection.consentUrl(["ZohoCRM.modules.ALL"], REDIRECT_URI));
  const [, , , state] = accounts.consentUrl.mock.lastCall ?? [];
  return state ?? "";
}

describe("ZohoConnection.getToken", () => {
  it("mints from the stored refresh token once, then answers from this process", async () => {
    const referenceId = newReferenceId();
    const connection = connectionFor(referenceId);
    repository.findRefreshToken.mockResolvedValue("refresh-1");
    accounts.refresh.mockResolvedValue({ accessToken: "access-1", expiresInSeconds: 3600 });

    const first = await inExecution(() => connection.getToken());
    const second = await inExecution(() => connection.getToken());

    expect([first, second]).toEqual(["access-1", "access-1"]);
    expect(repository.findRefreshToken).toHaveBeenCalledExactlyOnceWith(
      referenceId,
      CatalystScope.Admin,
    );
    expect(accounts.refresh).toHaveBeenCalledExactlyOnceWith(credentials, "refresh-1");
    expect(cache.getValue).toHaveBeenCalledOnce();
    expect(cache.putValue).toHaveBeenCalledExactlyOnceWith(
      `ZOT:${referenceId}`,
      expect.stringContaining('"accessToken":"access-1"'),
      1,
    );
  });

  it("uses a token another instance put in Catalyst Cache without minting", async () => {
    const connection = connectionFor(newReferenceId());
    cache.getValue.mockResolvedValue(
      JSON.stringify({ accessToken: "shared-1", expiresAt: Date.now() + ONE_HOUR_MS }),
    );

    const token = await inExecution(() => connection.getToken());

    expect(token).toBe("shared-1");
    expect(repository.findRefreshToken).not.toHaveBeenCalled();
    expect(accounts.refresh).not.toHaveBeenCalled();
  });

  it("mints once for concurrent requests of the same user", async () => {
    const connection = connectionFor(newReferenceId());
    repository.findRefreshToken.mockResolvedValue("refresh-1");
    accounts.refresh.mockResolvedValue({ accessToken: "access-1", expiresInSeconds: 3600 });

    const tokens = await inExecution(() =>
      Promise.all([connection.getToken(), connection.getToken(), connection.getToken()]),
    );

    expect(tokens).toEqual(["access-1", "access-1", "access-1"]);
    expect(accounts.refresh).toHaveBeenCalledOnce();
  });

  it("mints again rather than reuse a token inside the five-minute margin", async () => {
    const connection = connectionFor(newReferenceId());
    repository.findRefreshToken.mockResolvedValue("refresh-1");
    accounts.refresh.mockResolvedValue({ accessToken: "access-1", expiresInSeconds: 60 });

    await inExecution(() => connection.getToken());
    await inExecution(() => connection.getToken());

    expect(accounts.refresh).toHaveBeenCalledTimes(2);
    expect(repository.findRefreshToken).toHaveBeenCalledOnce();
  });

  it("retries with the table's token when Zoho rejects the cached one, keeping the grant", async () => {
    const connection = connectionFor(newReferenceId());
    repository.findRefreshToken
      .mockResolvedValueOnce("refresh-old")
      .mockResolvedValueOnce("refresh-new");
    accounts.refresh
      .mockResolvedValueOnce({ accessToken: "access-1", expiresInSeconds: 60 })
      .mockRejectedValueOnce(rejectedGrant())
      .mockResolvedValueOnce({ accessToken: "access-2", expiresInSeconds: 3600 });

    await inExecution(() => connection.getToken());
    const token = await inExecution(() => connection.getToken());

    expect(token).toBe("access-2");
    expect(accounts.refresh).toHaveBeenNthCalledWith(2, credentials, "refresh-old");
    expect(accounts.refresh).toHaveBeenNthCalledWith(3, credentials, "refresh-new");
    expect(repository.deleteByReferenceId).not.toHaveBeenCalled();
  });

  it("deletes the grant and reports not connected when Zoho rejects the table's token", async () => {
    const referenceId = newReferenceId();
    const connection = connectionFor(referenceId);
    repository.findRefreshToken.mockResolvedValue("refresh-1");
    accounts.refresh.mockRejectedValue(rejectedGrant());

    const minting = inExecution(() => connection.getToken());

    await expect(minting).rejects.toBeInstanceOf(ZohoAuthError);
    await expect(minting).rejects.toMatchObject({ code: ZohoAuthErrorCode.NotConnected });
    expect(repository.deleteByReferenceId).toHaveBeenCalledExactlyOnceWith(referenceId);
    expect(cache.deleteValue).toHaveBeenCalledExactlyOnceWith(`ZOT:${referenceId}`);
  });

  it("mints rather than use a Catalyst Cache token inside the five-minute margin", async () => {
    const connection = connectionFor(newReferenceId());
    cache.getValue.mockResolvedValue(
      JSON.stringify({ accessToken: "shared-1", expiresAt: Date.now() + 60_000 }),
    );
    repository.findRefreshToken.mockResolvedValue("refresh-1");
    accounts.refresh.mockResolvedValue({ accessToken: "access-1", expiresInSeconds: 3600 });

    const token = await inExecution(() => connection.getToken());

    expect(token).toBe("access-1");
    expect(accounts.refresh).toHaveBeenCalledOnce();
  });

  it("reports not connected when no grant is stored", async () => {
    const connection = connectionFor(newReferenceId());

    await expect(inExecution(() => connection.getToken())).rejects.toMatchObject({
      code: ZohoAuthErrorCode.NotConnected,
    });
    expect(accounts.refresh).not.toHaveBeenCalled();
  });
});

describe("ZohoConnection grant source", () => {
  it("reads the signed-in caller's grant as that user, never as Admin", async () => {
    const referenceId = newReferenceId();
    const connection = ZohoConnection.create(credentials, currentUserGrant);
    currentUser.mockResolvedValue({
      userId: referenceId,
      emailId: "asha@example.com",
      firstName: "Asha",
      lastName: "Rao",
    });
    repository.findRefreshToken.mockResolvedValue("refresh-1");
    accounts.refresh.mockResolvedValue({ accessToken: "access-1", expiresInSeconds: 3600 });

    const token = await inExecution(() => connection.getToken());

    expect(token).toBe("access-1");
    expect(repository.findRefreshToken).toHaveBeenCalledExactlyOnceWith(
      referenceId,
      CatalystScope.User,
    );
  });

  it("refuses to act without a grant from create or withGrant", async () => {
    const connection = ZohoConnection.create(credentials);

    await expect(inExecution(() => connection.getToken())).rejects.toMatchObject({
      code: ZohoAuthErrorCode.NotConfigured,
    });
  });

  it("applies withGrant to its own execution only", async () => {
    const connection = ZohoConnection.create(credentials);
    repository.findRefreshToken.mockResolvedValue("refresh-1");
    accounts.refresh.mockResolvedValue({ accessToken: "access-1", expiresInSeconds: 3600 });

    const token = await inExecution(async () => {
      connection.withGrant(userSpecificGrant(newReferenceId()));
      return connection.getToken();
    });

    expect(token).toBe("access-1");
    await expect(inExecution(() => connection.getToken())).rejects.toMatchObject({
      code: ZohoAuthErrorCode.NotConfigured,
    });
  });

  it("rejects a reference id that is not a Catalyst user id", () => {
    expect(() => userSpecificGrant("1 OR 1=1")).toThrow(
      expect.objectContaining({ code: ZohoAuthErrorCode.InvalidReferenceId }),
    );
  });

  it("rejects an accounts url that is not absolute", () => {
    expect(() => ZohoConnection.create({ ...credentials, accountsUrl: "accounts.zoho.in" })).toThrow(
      expect.objectContaining({ code: ZohoAuthErrorCode.NotConfigured }),
    );
  });
});

describe("ZohoConnection.persistToken", () => {
  it("accepts the state issued to the same user and stores the grant", async () => {
    const referenceId = newReferenceId();
    const connection = connectionFor(referenceId);
    repository.exists.mockResolvedValue(false);
    accounts.exchangeCode.mockResolvedValue({
      refreshToken: "refresh-1",
      accessToken: "access-1",
      expiresInSeconds: 3600,
    });
    const state = await issueConsentState(connection);

    await inExecution(() => connection.persistToken("code-1", state, REDIRECT_URI));
    const token = await inExecution(() => connection.getToken());

    expect(accounts.exchangeCode).toHaveBeenCalledExactlyOnceWith(
      credentials,
      "code-1",
      REDIRECT_URI,
    );
    expect(repository.insert).toHaveBeenCalledExactlyOnceWith(referenceId, "refresh-1");
    expect(token).toBe("access-1");
    expect(accounts.refresh).not.toHaveBeenCalled();
  });

  it("rejects a state issued to another user", async () => {
    const state = await issueConsentState(connectionFor(newReferenceId()));
    const otherUser = connectionFor(newReferenceId());

    await expect(
      inExecution(() => otherUser.persistToken("code-1", state, REDIRECT_URI)),
    ).rejects.toMatchObject({ code: ZohoAuthErrorCode.StateMismatch });
    expect(accounts.exchangeCode).not.toHaveBeenCalled();
  });

  it("rejects a state older than ten minutes", async () => {
    const connection = connectionFor(newReferenceId());
    const state = await issueConsentState(connection);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 11 * 60_000);

    await expect(
      inExecution(() => connection.persistToken("code-1", state, REDIRECT_URI)),
    ).rejects.toMatchObject({ code: ZohoAuthErrorCode.StateMismatch });
  });

  it("rejects a state that was tampered with", async () => {
    const connection = connectionFor(newReferenceId());

    await expect(
      inExecution(() => connection.persistToken("code-1", `${Date.now()}.forged`, REDIRECT_URI)),
    ).rejects.toMatchObject({ code: ZohoAuthErrorCode.StateMismatch });
  });

  it("stops before any exchange when a grant is already stored", async () => {
    const referenceId = newReferenceId();
    const connection = connectionFor(referenceId);
    repository.exists.mockResolvedValue(true);
    const state = await issueConsentState(connection);

    await inExecution(() => connection.persistToken("code-1", state, REDIRECT_URI));

    expect(repository.exists).toHaveBeenCalledExactlyOnceWith(referenceId, CatalystScope.User);
    expect(accounts.exchangeCode).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
  });
});

describe("ZohoConnection.disconnect", () => {
  it("revokes the stored token at Zoho, then deletes the grant", async () => {
    const referenceId = newReferenceId();
    const connection = connectionFor(referenceId);
    repository.findRefreshToken.mockResolvedValue("refresh-1");

    await inExecution(() => connection.disconnect());

    expect(accounts.revoke).toHaveBeenCalledExactlyOnceWith(credentials, "refresh-1");
    expect(repository.deleteByReferenceId).toHaveBeenCalledExactlyOnceWith(referenceId);
    expect(cache.deleteValue).toHaveBeenCalledExactlyOnceWith(`ZOT:${referenceId}`);
  });

  it("still deletes the grant when Zoho no longer knows the token", async () => {
    const referenceId = newReferenceId();
    const connection = connectionFor(referenceId);
    repository.findRefreshToken.mockResolvedValue("refresh-1");
    accounts.revoke.mockRejectedValue(new ZohoAuthError(accountsHttpCode(400), "400"));

    await inExecution(() => connection.disconnect());

    expect(repository.deleteByReferenceId).toHaveBeenCalledExactlyOnceWith(referenceId);
  });

  it("keeps the grant when the revoke fails for another reason", async () => {
    const connection = connectionFor(newReferenceId());
    repository.findRefreshToken.mockResolvedValue("refresh-1");
    accounts.revoke.mockRejectedValue(
      new ZohoAuthError(ZohoAuthErrorCode.AccountsUnreachable, "unreachable"),
    );

    await expect(inExecution(() => connection.disconnect())).rejects.toMatchObject({
      code: ZohoAuthErrorCode.AccountsUnreachable,
    });
    expect(repository.deleteByReferenceId).not.toHaveBeenCalled();
  });

  it("does nothing when no grant is stored", async () => {
    const connection = connectionFor(newReferenceId());

    await inExecution(() => connection.disconnect());

    expect(accounts.revoke).not.toHaveBeenCalled();
    expect(repository.deleteByReferenceId).not.toHaveBeenCalled();
  });
});

describe("ZohoConnection.isConnected", () => {
  it("answers from this process once a token is minted", async () => {
    const connection = connectionFor(newReferenceId());
    repository.findRefreshToken.mockResolvedValue("refresh-1");
    accounts.refresh.mockResolvedValue({ accessToken: "access-1", expiresInSeconds: 3600 });
    await inExecution(() => connection.getToken());

    const connected = await inExecution(() => connection.isConnected());

    expect(connected).toBe(true);
    expect(cache.getValue).toHaveBeenCalledOnce();
    expect(repository.exists).not.toHaveBeenCalled();
  });

  it("answers from Catalyst Cache when another instance minted the token", async () => {
    const connection = connectionFor(newReferenceId());
    cache.getValue.mockResolvedValue(
      JSON.stringify({ accessToken: "shared-1", expiresAt: Date.now() + ONE_HOUR_MS }),
    );

    const connected = await inExecution(() => connection.isConnected());

    expect(connected).toBe(true);
    expect(repository.exists).not.toHaveBeenCalled();
  });

  it("ignores a Catalyst Cache token inside the five-minute margin and asks the table", async () => {
    const referenceId = newReferenceId();
    const connection = connectionFor(referenceId);
    cache.getValue.mockResolvedValue(
      JSON.stringify({ accessToken: "shared-1", expiresAt: Date.now() + 60_000 }),
    );
    repository.exists.mockResolvedValue(false);

    const connected = await inExecution(() => connection.isConnected());

    expect(connected).toBe(false);
    expect(repository.exists).toHaveBeenCalledExactlyOnceWith(referenceId, CatalystScope.User);
  });

  it("answers from the cached refresh token once its access token has lapsed", async () => {
    const connection = connectionFor(newReferenceId());
    repository.findRefreshToken.mockResolvedValue("refresh-1");
    accounts.refresh.mockResolvedValue({ accessToken: "access-1", expiresInSeconds: 60 });
    await inExecution(() => connection.getToken());

    const connected = await inExecution(() => connection.isConnected());

    expect(connected).toBe(true);
    expect(cache.getValue).toHaveBeenCalledOnce();
    expect(repository.exists).not.toHaveBeenCalled();
  });

  it("asks the table, as the user, when nothing is cached", async () => {
    const referenceId = newReferenceId();
    const connection = connectionFor(referenceId);
    repository.exists.mockResolvedValue(false);

    const connected = await inExecution(() => connection.isConnected());

    expect(connected).toBe(false);
    expect(repository.exists).toHaveBeenCalledExactlyOnceWith(referenceId, CatalystScope.User);
  });
});
