import { createHmac, timingSafeEqual } from "node:crypto";
import {
  accountsHttpCode,
  ZohoAuthError,
  ZohoAuthErrorCode,
} from "@/errors/zoho-auth-error";
import { CatalystScope } from "@/enums/catalyst-scope";
import { currentContext } from "@/framework/async-context";
import {
  zohoConnectionCache,
  zohoConnectionTable,
} from "@/services/catalyst/resources";
import { UserManagement } from "@/services/catalyst/user-management";
import { Zcql } from "@/services/catalyst/zcql";
import {
  ZohoAccounts,
  type ZohoAccessToken,
  type ZohoCredentials,
} from "@/services/zoho/accounts";
import { LruCache } from "@/utils/lru-cache";
import { PLimitPerKey } from "@/utils/p-limit-per-key";

/** Where the signed-in caller's id is kept for the rest of the execution. */
const REFERENCE_ID_KEY = "zoho.referenceId";
/** Where `withGrant` keeps the grant for the rest of the execution. */
const GRANT_SOURCE_KEY = "zoho.grantSource";
/** Renew five minutes early rather than hand out a token that expires mid-flight. */
const EXPIRY_MARGIN_MS = 5 * 60_000;
/** Catalyst segments measure TTL in hours, and a Zoho access token lives one. */
const CACHE_EXPIRY_HOURS = 1;
/** Long enough to read Zoho's consent screen, short enough that a leaked url goes stale. */
const CONSENT_STATE_TTL_MS = 10 * 60_000;
/** `/connect` and `/callback` may land on different AppSail instances, whose clocks need
 *  not agree to the millisecond. */
const CLOCK_SKEW_MS = 60_000;
/** Ties the signature to this one purpose, since the key is the client secret. */
const CONSENT_STATE_LABEL = "zoho-consent-state";
/** Enough for every user one AppSail instance is likely to serve between restarts. */
const CACHED_USER_CAPACITY = 1000;

/** What the caches hold. The segment TTL is measured in whole hours and so is far too
 *  coarse to rely on alone; the expiry travels with the token and is checked on read. */
interface CachedAccessToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Tokens already minted in this process, so a second request skips the Catalyst Cache
 * round trip as well as the mint.
 *
 * A cache that outlives a request is exactly what the Catalyst wrappers forbid, and it is
 * safe here for one reason: it is keyed strictly by Catalyst user id and holds a value
 * rather than a client carrying the caller's credentials. Key it by anything else and it
 * starts serving one user's token to another.
 *
 * It is per process, so several AppSail instances each keep their own. That costs an extra
 * mint, never a wrong answer - every read still checks `expiresAt`.
 */
const mintedTokens = new LruCache<CachedAccessToken>(CACHED_USER_CAPACITY);

/**
 * Refresh tokens already read from the table in this process, so a mint after the first
 * skips the ZCQL round trip. Keyed by Catalyst user id, for the same reason as
 * `mintedTokens`.
 *
 * In-process only, never Catalyst Cache: the table holds the token in an encrypted
 * column, and a cache entry would hold the same long-lived secret in the clear.
 *
 * Another instance may replace or revoke a grant after this one cached it, so a cached
 * token is trusted only until Zoho rejects it - then the table decides, see `mint`.
 */
const refreshTokens = new LruCache<string>(CACHED_USER_CAPACITY);

/** One grant operation per user at a time: concurrent mints wait for the first and reuse
 *  its token, and a duplicate callback finds the grant the first one stored. Keyed
 *  strictly by Catalyst user id, for the same reason as `mintedTokens`. */
const grantLocks = new PLimitPerKey(1);

/** Whose Zoho grant a connection acts on, and where its refresh token is kept. */
export interface GrantSource {
  /** Whose grant this is. Also the key of the lock and both caches. */
  getReferenceId(): Promise<string>;
  getRefreshToken(): Promise<string>;
}

/** The signed-in caller, looked up once per execution. */
export const currentUserGrant: GrantSource = {
  async getReferenceId(): Promise<string> {
    const manager = currentContext().manager;
    const known = manager.getExtras<string>(REFERENCE_ID_KEY);
    if (known !== undefined) {
      return known;
    }
    const caller = await UserManagement.currentUser();
    manager.setExtras(REFERENCE_ID_KEY, caller.userId);
    return caller.userId;
  },
  async getRefreshToken(): Promise<string> {
    const referenceId = await currentUserGrant.getReferenceId();
    return storedRefreshToken(referenceId, CatalystScope.User);
  },
};

/** A named user, for a background job that has no signed-in caller. Reads with Admin,
 *  which is safe only because the id is the job's own, never one taken from a request. */
export function userSpecificGrant(referenceId: string): GrantSource {
  // Catalyst user ids are numeric, so anything else cannot name a row and has no
  // business reaching a ZCQL statement.
  if (!/^\d+$/.test(referenceId)) {
    throw new ZohoAuthError(
      ZohoAuthErrorCode.InvalidReferenceId,
      `"${referenceId}" is not a Catalyst user id.`,
    );
  }
  return {
    getReferenceId: async () => referenceId,
    getRefreshToken: () => storedRefreshToken(referenceId, CatalystScope.Admin),
  };
}

async function storedRefreshToken(
  referenceId: string,
  scope: CatalystScope,
): Promise<string> {
  const table = zohoConnectionTable;
  const rows = await Zcql.runIn(scope).executeQuery(
    `SELECT ${table.column("REFRESH_TOKEN")} FROM ${table.name} WHERE ${table.column("REFERENCE_ID")} = '${referenceId}' LIMIT 1`,
  );
  const refreshToken = rows[0]?.[table.column("REFRESH_TOKEN")];
  if (typeof refreshToken !== "string") {
    throw new ZohoAuthError(
      ZohoAuthErrorCode.NotConnected,
      `No Zoho grant is stored for ${referenceId}.`,
    );
  }
  return refreshToken;
}

/**
 * The Zoho grant of whoever the grant source names. Built once by the app that owns the
 * keys; the grant given to `create` is the default, and `withGrant` overrides it for one
 * execution.
 */
export class ZohoConnection {
  private constructor(
    private readonly credentials: ZohoCredentials,
    private readonly defaultGrant: GrantSource | undefined,
  ) {}

  /** The package owns no keys, so the app reads them and hands them over here. Without a
   *  grant, every execution must call `withGrant` before anything else. */
  static create(
    credentials: ZohoCredentials,
    grant?: GrantSource,
  ): ZohoConnection {
    if (!URL.canParse(credentials.accountsUrl)) {
      throw new ZohoAuthError(
        ZohoAuthErrorCode.NotConfigured,
        `"${credentials.accountsUrl}" is not an absolute accounts url.`,
      );
    }
    return new ZohoConnection(credentials, grant);
  }

  /** Kept on the execution, never on this instance: the instance is shared by every
   *  concurrent request, so a grant stored here would hand one user's token to another. */
  withGrant(source: GrantSource): void {
    currentContext().manager.setExtras(GRANT_SOURCE_KEY, source);
  }

  /** Where to send the browser for consent. The state it carries ties the redirect to
   *  the user who asked for it. Without that, anyone can hand a signed-in user a callback
   *  url carrying their own grant code and bind this user's account to someone else's Zoho
   *  org. */
  async consentUrl(scopes: string[], redirectUri: string): Promise<string> {
    const referenceId = await this.grant().getReferenceId();
    const issuedAt = Date.now();
    const state = `${issuedAt}.${this.signConsentState(referenceId, issuedAt)}`;
    return ZohoAccounts.consentUrl(
      this.credentials,
      scopes,
      redirectUri,
      state,
    );
  }

  /** Checks the state, trades the grant code for a refresh token and stores it. Does
   *  nothing past the state check when a grant is already stored - no exchange, and no
   *  request to Zoho. */
  async persistToken(
    code: string,
    state: string,
    redirectUri: string,
  ): Promise<void> {
    const referenceId = await this.grant().getReferenceId();
    await grantLocks.run(referenceId, () =>
      this.persistGrant(referenceId, code, state, redirectUri),
    );
  }

  /** Whether the grant can be used right now, answered as cheaply as possible and never
   *  by minting: a usable token in this process or in Catalyst Cache proves a grant
   *  exists, so only a cold cache falls through to the stored-grant check. */
  async isConnected(): Promise<boolean> {
    const referenceId = await this.grant().getReferenceId();
    if (
      ZohoConnection.isUsable(mintedTokens.get(referenceId)) ||
      refreshTokens.get(referenceId) !== undefined
    ) {
      return true;
    }
    const cached = await ZohoConnection.getCachedTokenFromCatalyst(referenceId);
    if (ZohoConnection.isUsable(cached)) {
      mintedTokens.set(referenceId, cached);
      return true;
    }
    return (
      (await ZohoConnection.storedGrantRowId(
        referenceId,
        CatalystScope.User,
      )) !== undefined
    );
  }

  /** Revokes the grant at Zoho and deletes it here, so the next `/connect` asks for
   *  consent again. Does nothing when no grant is stored. */
  async disconnect(): Promise<void> {
    const grant = this.grant();
    const referenceId = await grant.getReferenceId();
    await grantLocks.run(referenceId, () =>
      this.revokeGrant(referenceId, grant),
    );
  }

  /** A token valid right now: this process's own, then Catalyst Cache's, then a fresh
   *  mint from the stored refresh token. */
  async getToken(): Promise<string> {
    const grant = this.grant();
    const referenceId = await grant.getReferenceId();
    const local = mintedTokens.get(referenceId);
    if (ZohoConnection.isUsable(local)) {
      return local.accessToken;
    }
    return grantLocks.run(referenceId, () =>
      this.resolveToken(referenceId, grant),
    );
  }

  /** The execution's own grant, else the one given to `create`. */
  private grant(): GrantSource {
    const grant =
      currentContext().manager.getExtras<GrantSource>(GRANT_SOURCE_KEY) ??
      this.defaultGrant;
    if (grant === undefined) {
      throw new ZohoAuthError(
        ZohoAuthErrorCode.NotConfigured,
        "No grant source is set. Pass one to ZohoConnection.create or call withGrant.",
      );
    }
    return grant;
  }

  /** Signed rather than stored, so consent costs no Catalyst call. The state is
   *  `issuedAt.signature`; the reference id is in the signature, never in the url, so a
   *  state issued to one user fails for every other. Not single-use, and need not be: a
   *  grant code is single-use at Zoho, and a user already connected stops before any
   *  exchange. */
  private verifyState(referenceId: string, state: string): void {
    const [issuedAtText, signature] = state.split(".");
    const issuedAt = Number(issuedAtText);
    const age = Date.now() - issuedAt;
    const expected = Buffer.from(this.signConsentState(referenceId, issuedAt));
    const received = Buffer.from(signature ?? "");
    const valid =
      Number.isInteger(issuedAt) &&
      age >= -CLOCK_SKEW_MS &&
      age <= CONSENT_STATE_TTL_MS &&
      received.length === expected.length &&
      timingSafeEqual(received, expected);
    if (!valid) {
      throw new ZohoAuthError(
        ZohoAuthErrorCode.StateMismatch,
        "state does not match the consent request.",
      );
    }
  }

  /** HMAC keyed by the client secret, which only this server holds. */
  private signConsentState(referenceId: string, issuedAt: number): string {
    return createHmac("sha256", this.credentials.clientSecret)
      .update(`${CONSENT_STATE_LABEL}:${referenceId}:${issuedAt}`)
      .digest("base64url");
  }

  /** Runs under the owner's grant lock, so the state check, the existence check and the
   *  insert cannot interleave with a second callback for the same user. */
  private async persistGrant(
    referenceId: string,
    code: string,
    state: string,
    redirectUri: string,
  ): Promise<void> {
    this.verifyState(referenceId, state);
    const stored = await ZohoConnection.storedGrantRowId(
      referenceId,
      CatalystScope.User,
    );
    if (stored !== undefined) {
      return;
    }
    const grant = await ZohoAccounts.exchangeCode(
      this.credentials,
      code,
      redirectUri,
    );
    // Always User: the table's App User scope is USER, so only the row's creator can
    // read it back, and the creator has to be the user it belongs to.
    await zohoConnectionTable.runIn(CatalystScope.User).insertRow({
      REFERENCE_ID: referenceId,
      REFRESH_TOKEN: grant.refreshToken,
    });
    refreshTokens.set(referenceId, grant.refreshToken);
    await ZohoConnection.cacheAccessToken(
      referenceId,
      grant.accessToken,
      grant.expiresInSeconds,
    );
  }

  /** Runs under the owner's grant lock. Checks the local cache again first, because the
   *  previous holder may have just stored the token this caller was waiting for. */
  private async resolveToken(
    referenceId: string,
    grant: GrantSource,
  ): Promise<string> {
    const local = mintedTokens.get(referenceId);
    if (ZohoConnection.isUsable(local)) {
      return local.accessToken;
    }
    const cached = await ZohoConnection.getCachedTokenFromCatalyst(referenceId);
    if (ZohoConnection.isUsable(cached)) {
      mintedTokens.set(referenceId, cached);
      return cached.accessToken;
    }
    const minted = await this.mint(referenceId, grant);
    await ZohoConnection.cacheAccessToken(
      referenceId,
      minted.accessToken,
      minted.expiresInSeconds,
    );
    return minted.accessToken;
  }

  /** The authoritative answer, straight from the datastore. `Table.getRow` is not
   *  usable here: it takes a ROWID and reports every failure as a missing row, so a
   *  datastore outage would read as "not connected" and mint a second grant. */
  private static async storedGrantRowId(
    referenceId: string,
    scope: CatalystScope,
  ): Promise<string | undefined> {
    const table = zohoConnectionTable;
    const rows = await Zcql.runIn(scope).executeQuery(
      `SELECT ${table.column("ROWID")} FROM ${table.name} WHERE ${table.column("REFERENCE_ID")} = '${referenceId}' LIMIT 1`,
    );
    const rowId = rows[0]?.[table.column("ROWID")];
    return typeof rowId === "string" ? rowId : undefined;
  }

  /** Mints from the cached refresh token when there is one. A rejection of a cached token
   *  proves nothing about the stored grant - another instance may have replaced it since -
   *  so it only evicts the cache, and the table's token gets the final say. */
  private async mint(
    referenceId: string,
    grant: GrantSource,
  ): Promise<ZohoAccessToken> {
    const cached = refreshTokens.get(referenceId);
    if (cached !== undefined) {
      try {
        return await ZohoAccounts.refresh(this.credentials, cached);
      } catch (error) {
        if (!ZohoConnection.isRejectedGrant(error)) {
          throw error;
        }
        refreshTokens.delete(referenceId);
      }
    }
    return this.mintFromStore(referenceId, grant);
  }

  /** A refresh token Zoho no longer honours - revoked by the user or an admin, or pruned
   *  once the user holds too many - is deleted here, so the grant reads as not
   *  connected and `/connect` can ask for consent again instead of failing forever. */
  private async mintFromStore(
    referenceId: string,
    grant: GrantSource,
  ): Promise<ZohoAccessToken> {
    const refreshToken = await grant.getRefreshToken();
    try {
      const minted = await ZohoAccounts.refresh(this.credentials, refreshToken);
      refreshTokens.set(referenceId, refreshToken);
      return minted;
    } catch (error) {
      if (ZohoConnection.isRejectedGrant(error)) {
        await ZohoConnection.deleteGrant(referenceId);
        throw new ZohoAuthError(
          ZohoAuthErrorCode.NotConnected,
          `Zoho no longer accepts the grant stored for ${referenceId}.`,
          error,
        );
      }
      throw error;
    }
  }

  private static isRejectedGrant(error: unknown): boolean {
    return (
      error instanceof ZohoAuthError &&
      error.code === ZohoAuthErrorCode.InvalidGrantCode
    );
  }

  /** Runs under the owner's grant lock. Reads the table, not the cache: a token cached
   *  here may be one another instance has already replaced, and revoking that would leave
   *  the live grant working at Zoho. Reading the refresh token is also the existence
   *  check - it throws `NotConnected` when there is no row - so nothing is asked twice.
   *  Zoho answers a token it no longer knows with a 400, which means the grant is already
   *  gone there and only needs deleting here. */
  private async revokeGrant(
    referenceId: string,
    grant: GrantSource,
  ): Promise<void> {
    const refreshToken = await ZohoConnection.storedOrNone(grant);
    if (refreshToken === undefined) {
      return;
    }
    try {
      await ZohoAccounts.revoke(this.credentials, refreshToken);
    } catch (error) {
      if (
        !(error instanceof ZohoAuthError) ||
        error.code !== accountsHttpCode(400)
      ) {
        throw error;
      }
    }
    await ZohoConnection.deleteGrant(referenceId);
  }

  private static async storedOrNone(
    grant: GrantSource,
  ): Promise<string | undefined> {
    try {
      return await grant.getRefreshToken();
    } catch (error) {
      if (
        error instanceof ZohoAuthError &&
        error.code === ZohoAuthErrorCode.NotConnected
      ) {
        return undefined;
      }
      throw error;
    }
  }

  /** Clears the stored grant, both of this process's caches and the Catalyst Cache entry.
   *  Admin, because a rejected grant is also found by a job, which has no user; safe
   *  because `referenceId` is always one this connection resolved, never one a request
   *  supplied. Another AppSail instance may still hold the token in its own LRU until it
   *  expires; that is at most an hour. */
  private static async deleteGrant(referenceId: string): Promise<void> {
    const table = zohoConnectionTable;
    await Zcql.runIn(CatalystScope.Admin).executeQuery(
      `DELETE FROM ${table.name} WHERE ${table.column("REFERENCE_ID")} = '${referenceId}'`,
    );
    mintedTokens.delete(referenceId);
    refreshTokens.delete(referenceId);
    await zohoConnectionCache.deleteValue(
      ZohoConnection.accessTokenCacheKey(referenceId),
    );
  }

  /** Catalyst Cache only - the LRU is checked by the caller first, because a hit there
   *  costs no call at all. */
  private static async getCachedTokenFromCatalyst(
    referenceId: string,
  ): Promise<CachedAccessToken | undefined> {
    const value = await zohoConnectionCache.getValue(
      ZohoConnection.accessTokenCacheKey(referenceId),
    );
    return value === undefined
      ? undefined
      : (JSON.parse(value) as CachedAccessToken);
  }

  /** Into both caches: this process's LRU and Catalyst Cache, for the other instances. */
  private static async cacheAccessToken(
    referenceId: string,
    accessToken: string,
    expiresInSeconds: number,
  ): Promise<void> {
    const entry: CachedAccessToken = {
      accessToken,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    };
    mintedTokens.set(referenceId, entry);
    await zohoConnectionCache.putValue(
      ZohoConnection.accessTokenCacheKey(referenceId),
      JSON.stringify(entry),
      CACHE_EXPIRY_HOURS,
    );
  }

  private static isUsable(
    entry: CachedAccessToken | undefined,
  ): entry is CachedAccessToken {
    return (
      entry !== undefined && entry.expiresAt - EXPIRY_MARGIN_MS > Date.now()
    );
  }

  private static accessTokenCacheKey(referenceId: string): string {
    return `ZOT:${referenceId}`;
  }

}
