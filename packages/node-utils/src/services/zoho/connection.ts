import { randomUUID } from "node:crypto";
import { ZohoAuthError, ZohoAuthErrorCode } from "@/errors/zoho-auth-error";
import { CatalystScope } from "@/enums/catalyst-scope";
import { currentContext } from "@/framework/async-context";
import {
  zohoConnectionCache,
  zohoConnectionTable,
} from "@/services/catalyst/resources";
import { UserManagement } from "@/services/catalyst/user-management";
import { Zcql } from "@/services/catalyst/zcql";
import { ZohoAccounts, type ZohoCredentials } from "@/services/zoho/accounts";
import { LruCache } from "@/utils/lru-cache";
import { PLimit } from "@/utils/p-limit";
import { PLimitPerKey } from "@/utils/p-limit-per-key";

const TABLE = "ZohoConnection";
/** Where the grant owner is kept for the rest of the execution. */
const REFERENCE_ID_KEY = "zoho.referenceId";
/** Renew five minutes early rather than hand out a token that expires mid-flight. */
const EXPIRY_MARGIN_MS = 5 * 60_000;
/** Catalyst segments measure TTL in hours, and a Zoho access token lives one. */
const CACHE_EXPIRY_HOURS = 1;
/** Enough for every user one AppSail instance is likely to serve between restarts. */
const MINTED_TOKEN_CAPACITY = 1000;
/** Zoho throttles the accounts server; one instance never holds more open than this. */
const MAX_CONCURRENT_ZOHO_ACCOUNTS_REQUESTS = 10;

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
const mintedTokens = new LruCache<CachedAccessToken>(MINTED_TOKEN_CAPACITY);

const accountsRequests = new PLimit(MAX_CONCURRENT_ZOHO_ACCOUNTS_REQUESTS);

/** One grant operation per user at a time: concurrent mints wait for the first and reuse
 *  its token, and a duplicate callback finds the grant the first one stored. Keyed
 *  strictly by Catalyst user id, for the same reason as `mintedTokens`. */
const grantLocks = new PLimitPerKey(1);

/** Set once at startup by the app that owns the keys - see `setCredentials`. */
let configuredCredentials: ZohoCredentials | undefined;

/**
 * The Zoho grant of whoever the execution belongs to. Inside a request that is the
 * signed-in caller, resolved on first use; a background job names the owner itself with
 * `setReferenceId` before calling anything else.
 */
export class ZohoConnection {
  /** Called once at startup. The package owns no keys, so the app reads them and hands
   *  them over here, the same way it calls `setLogTimeZone`. */
  static setCredentials(credentials: ZohoCredentials): void {
    if (!URL.canParse(credentials.accountsUrl)) {
      throw new ZohoAuthError(
        ZohoAuthErrorCode.NotConfigured,
        `"${credentials.accountsUrl}" is not an absolute accounts url.`,
      );
    }
    configuredCredentials = credentials;
  }

  /** Names the grant owner for the rest of the execution. A request never needs this;
   *  a job, which has no signed-in caller, must call it first. */
  static setReferenceId(referenceId: string): void {
    // Catalyst user ids are numeric, so anything else cannot name a row and has no
    // business reaching a ZCQL statement.
    if (!/^\d+$/.test(referenceId)) {
      throw new ZohoAuthError(
        ZohoAuthErrorCode.InvalidReferenceId,
        `"${referenceId}" is not a Catalyst user id.`,
      );
    }
    currentContext().manager.setExtras(REFERENCE_ID_KEY, referenceId);
  }

  /** Where to send the browser for consent. The state it carries ties the redirect to
   *  the browser that asked for it. Without that, anyone can hand a signed-in user a
   *  callback url carrying their own grant code and bind this user's account to someone
   *  else's Zoho org. */
  static async consentUrl(
    scopes: string[],
    redirectUri: string,
  ): Promise<string> {
    const referenceId = await ZohoConnection.referenceId();
    const state = randomUUID();
    await zohoConnectionCache.putValue(
      ZohoConnection.stateKey(referenceId),
      state,
      CACHE_EXPIRY_HOURS,
    );
    return ZohoAccounts.consentUrl(
      ZohoConnection.credentials(),
      scopes,
      redirectUri,
      state,
    );
  }

  /** Checks the state, trades the grant code for a refresh token and stores it. Does
   *  nothing past the state check when a grant is already stored - no exchange, and no
   *  request to Zoho. */
  static async persistToken(
    code: string,
    state: string,
    redirectUri: string,
  ): Promise<void> {
    const referenceId = await ZohoConnection.referenceId();
    const credentials = ZohoConnection.credentials();
    await grantLocks.run(referenceId, () =>
      ZohoConnection.persistGrant(
        referenceId,
        credentials,
        code,
        state,
        redirectUri,
      ),
    );
  }

  /** Whether the caller can use Zoho right now, answered as cheaply as possible and never
   *  by minting: a usable token in this process or the shared cache proves a grant
   *  exists, so only a cold cache falls through to the stored-grant check. */
  static async isConnected(): Promise<boolean> {
    const referenceId = await ZohoConnection.referenceId();
    if (ZohoConnection.isUsable(mintedTokens.get(referenceId))) {
      return true;
    }
    const shared = await ZohoConnection.sharedToken(referenceId);
    if (ZohoConnection.isUsable(shared)) {
      mintedTokens.set(referenceId, shared);
      return true;
    }
    return ZohoConnection.hasStoredGrant(referenceId);
  }

  /** A token valid right now: this process's own, then the shared cache, then a fresh
   *  mint from the stored refresh token. */
  static async getToken(): Promise<string> {
    const referenceId = await ZohoConnection.referenceId();
    const local = mintedTokens.get(referenceId);
    if (ZohoConnection.isUsable(local)) {
      return local.accessToken;
    }
    const credentials = ZohoConnection.credentials();
    return grantLocks.run(referenceId, () =>
      ZohoConnection.resolveToken(referenceId, credentials),
    );
  }

  /** The owner named by `setReferenceId`, else the signed-in caller, remembered so the
   *  caller is looked up once per execution. */
  private static async referenceId(): Promise<string> {
    const known =
      currentContext().manager.getExtras<string>(REFERENCE_ID_KEY);
    if (known !== undefined) {
      return known;
    }
    const caller = await UserManagement.currentUser();
    ZohoConnection.setReferenceId(caller.userId);
    return caller.userId;
  }

  private static credentials(): ZohoCredentials {
    if (configuredCredentials === undefined) {
      throw new ZohoAuthError(
        ZohoAuthErrorCode.NotConfigured,
        "ZohoConnection.setCredentials was not called at startup.",
      );
    }
    return configuredCredentials;
  }

  /** Passes once, and only for the state issued to this owner. */
  private static async verifyState(
    referenceId: string,
    state: string,
  ): Promise<void> {
    const issued = await zohoConnectionCache.getValue(
      ZohoConnection.stateKey(referenceId),
    );
    if (issued === undefined || issued !== state) {
      throw new ZohoAuthError(
        ZohoAuthErrorCode.StateMismatch,
        "state does not match the consent request.",
      );
    }
    await zohoConnectionCache.deleteValue(ZohoConnection.stateKey(referenceId));
  }

  /** Runs under the owner's grant lock, so the state check, the existence check and the
   *  insert cannot interleave with a second callback for the same user. */
  private static async persistGrant(
    referenceId: string,
    credentials: ZohoCredentials,
    code: string,
    state: string,
    redirectUri: string,
  ): Promise<void> {
    await ZohoConnection.verifyState(referenceId, state);
    if (await ZohoConnection.hasStoredGrant(referenceId)) {
      return;
    }
    const grant = await accountsRequests.run(() =>
      ZohoAccounts.exchangeCode(credentials, code, redirectUri),
    );
    await zohoConnectionTable.runIn(CatalystScope.User).insertRow({
      REFERENCE_ID: referenceId,
      REFRESH_TOKEN: grant.refreshToken,
    });
    await ZohoConnection.store(
      referenceId,
      grant.accessToken,
      grant.expiresInSeconds,
    );
  }

  /** Runs under the owner's grant lock. Checks the local cache again first, because the
   *  previous holder may have just stored the token this caller was waiting for. */
  private static async resolveToken(
    referenceId: string,
    credentials: ZohoCredentials,
  ): Promise<string> {
    const local = mintedTokens.get(referenceId);
    if (ZohoConnection.isUsable(local)) {
      return local.accessToken;
    }
    const shared = await ZohoConnection.sharedToken(referenceId);
    if (ZohoConnection.isUsable(shared)) {
      mintedTokens.set(referenceId, shared);
      return shared.accessToken;
    }
    const refreshToken =
      await ZohoConnection.storedRefreshToken(referenceId);
    const minted = await accountsRequests.run(() =>
      ZohoAccounts.refresh(credentials, refreshToken),
    );
    await ZohoConnection.store(
      referenceId,
      minted.accessToken,
      minted.expiresInSeconds,
    );
    return minted.accessToken;
  }

  /** The authoritative answer, straight from the datastore. `Table.getRow` is not
   *  usable here: it takes a ROWID and reports every failure as a missing row, so a
   *  datastore outage would read as "not connected" and mint a second grant. */
  private static async hasStoredGrant(referenceId: string): Promise<boolean> {
    const rows = await Zcql.runIn(CatalystScope.User).executeQuery(
      `SELECT ROWID FROM ${TABLE} WHERE REFERENCE_ID = '${referenceId}' LIMIT 1`,
    );
    return rows.length > 0;
  }

  private static async storedRefreshToken(
    referenceId: string,
  ): Promise<string> {
    const rows = await Zcql.runIn(CatalystScope.User).executeQuery(
      `SELECT REFRESH_TOKEN FROM ${TABLE} WHERE REFERENCE_ID = '${referenceId}' LIMIT 1`,
    );
    const refreshToken = rows[0]?.["REFRESH_TOKEN"];
    if (typeof refreshToken !== "string") {
      throw new ZohoAuthError(
        ZohoAuthErrorCode.NotConnected,
        `No Zoho grant is stored for ${referenceId}.`,
      );
    }
    return refreshToken;
  }

  private static async sharedToken(
    referenceId: string,
  ): Promise<CachedAccessToken | undefined> {
    const value = await zohoConnectionCache.getValue(
      ZohoConnection.tokenKey(referenceId),
    );
    return value === undefined
      ? undefined
      : (JSON.parse(value) as CachedAccessToken);
  }

  private static async store(
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
      ZohoConnection.tokenKey(referenceId),
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

  private static tokenKey(referenceId: string): string {
    return `ZOT:${referenceId}`;
  }

  private static stateKey(referenceId: string): string {
    return `ZOS:${referenceId}`;
  }
}
