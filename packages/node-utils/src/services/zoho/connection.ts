import { randomUUID } from "node:crypto";
import { ZohoAuthCode, ZohoAuthError } from "@/errors/zoho_auth_error";
import {
  zohoConnectionCache,
  zohoConnectionTable,
} from "@/services/catalyst/resources";
import { Zcql } from "@/services/catalyst/zcql";
import type { ZohoAccounts } from "@/services/zoho/accounts";
import { LruCache } from "@/utils/lru_cache";

const TABLE = "ZohoConnection";
/** Renew a minute early rather than hand out a token that expires mid-flight. */
const EXPIRY_MARGIN_MS = 60_000;
/** Catalyst segments measure TTL in hours, and a Zoho access token lives one. */
const CACHE_EXPIRY_HOURS = 1;
/** Enough for every user one AppSail instance is likely to serve between restarts. */
const MINTED_TOKEN_CAPACITY = 1000;

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

function isUsable(
  entry: CachedAccessToken | undefined,
): entry is CachedAccessToken {
  return entry !== undefined && entry.expiresAt - EXPIRY_MARGIN_MS > Date.now();
}

/** One Zoho grant, owned by whoever `referenceId` names. */
export class ZohoConnection {
  private constructor(
    private readonly referenceId: string,
    private readonly accounts: ZohoAccounts,
  ) {
    // Catalyst user ids are numeric, so anything else cannot name a row and has no
    // business reaching a ZCQL statement.
    if (!/^\d+$/.test(referenceId)) {
      throw new ZohoAuthError(
        ZohoAuthCode.InvalidReferenceId,
        `"${referenceId}" is not a Catalyst user id.`,
      );
    }
  }

  /** Whether a grant is already stored. `Table.getRow` is not usable here: it takes a
   *  ROWID and reports every failure as a missing row, so a datastore outage would read
   *  as "not connected" and mint a second grant. */
  async isConnected(): Promise<boolean> {
    const rows = await Zcql.executeQuery(
      `SELECT ROWID FROM ${TABLE} WHERE referenceId = '${this.referenceId}' LIMIT 1`,
    );
    return rows.length > 0;
  }

  /** Ties a consent redirect to the browser that asked for it. Without this, anyone can
   *  hand a signed-in user a callback url carrying their own grant code and bind this
   *  user's account to someone else's Zoho org. */
  async issueState(): Promise<string> {
    const state = randomUUID();
    await zohoConnectionCache.putValue(
      this.stateKey(),
      state,
      CACHE_EXPIRY_HOURS,
    );
    return state;
  }

  /** True once, and only for the state this connection issued. */
  async verifyState(state: string): Promise<boolean> {
    const issued = await zohoConnectionCache.getValue(this.stateKey());
    if (issued === undefined || issued !== state) {
      return false;
    }
    await zohoConnectionCache.deleteValue(this.stateKey());
    return true;
  }

  /** Trades the grant code for a refresh token and stores it. Does nothing at all when a
   *  grant is already stored - no exchange, and no request to Zoho. */
  async connect(code: string, redirectUri: string): Promise<void> {
    if (await this.isConnected()) {
      return;
    }
    const grant = await this.accounts.exchangeCode(code, redirectUri);
    await zohoConnectionTable.insertRow({
      referenceId: this.referenceId,
      refreshToken: grant.refreshToken,
    });
    await this.store(grant.accessToken, grant.expiresInSeconds);
  }

  /** A token valid right now: this process's own, then the shared cache, then a fresh
   *  mint from the stored refresh token. */
  async accessToken(): Promise<string> {
    const local = mintedTokens.get(this.referenceId);
    if (isUsable(local)) {
      return local.accessToken;
    }
    const shared = await this.sharedToken();
    if (isUsable(shared)) {
      mintedTokens.set(this.referenceId, shared);
      return shared.accessToken;
    }
    const minted = await this.accounts.refresh(await this.storedRefreshToken());
    await this.store(minted.accessToken, minted.expiresInSeconds);
    return minted.accessToken;
  }

  private async storedRefreshToken(): Promise<string> {
    const rows = await Zcql.executeQuery(
      `SELECT refreshToken FROM ${TABLE} WHERE referenceId = '${this.referenceId}' LIMIT 1`,
    );
    const refreshToken = rows[0]?.["refreshToken"];
    if (typeof refreshToken !== "string") {
      throw new ZohoAuthError(
        ZohoAuthCode.NotConnected,
        `No Zoho grant is stored for ${this.referenceId}.`,
      );
    }
    return refreshToken;
  }

  private async sharedToken(): Promise<CachedAccessToken | undefined> {
    const value = await zohoConnectionCache.getValue(this.tokenKey());
    return value === undefined
      ? undefined
      : (JSON.parse(value) as CachedAccessToken);
  }

  private async store(
    accessToken: string,
    expiresInSeconds: number,
  ): Promise<void> {
    const entry: CachedAccessToken = {
      accessToken,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    };
    mintedTokens.set(this.referenceId, entry);
    await zohoConnectionCache.putValue(
      this.tokenKey(),
      JSON.stringify(entry),
      CACHE_EXPIRY_HOURS,
    );
  }

  private tokenKey(): string {
    return `zoho-access-token:${this.referenceId}`;
  }

  private stateKey(): string {
    return `zoho-oauth-state:${this.referenceId}`;
  }

  static create(referenceId: string, accounts: ZohoAccounts): ZohoConnection {
    return new ZohoConnection(referenceId, accounts);
  }
}
