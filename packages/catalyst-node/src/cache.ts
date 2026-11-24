import { Cache as CacheClient } from "@zcatalyst/cache";
import { CatalystError } from "@/catalyst-error";
import { CatalystScope } from "@/catalyst-scope";
import { CatalystSession } from "@/catalyst-session";

/** The SDK exports only its top-level clients, so segment/bucket/table types are
 *  derived from the methods that produce them rather than imported. */
type Segment = ReturnType<CacheClient["segment"]>;

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope. Cache is admin-only.
 *  Never construct the client without an app: the SDK then falls back to whichever
 *  request called `zcAuth.init` last, and switches that request's credential to admin. */
function cacheClient(): CacheClient {
  return new CacheClient(CatalystSession.app(CatalystScope.Admin));
}

/** A Catalyst cache segment. Omit the id to use the project's default segment. Holds the id
 *  only, and acts for the request in flight with its Admin credentials - Cache is admin-only,
 *  so it takes no scope. */
export class Cache {
  private constructor(private readonly segmentId?: string) {}

  /** Creates a handle to a named segment, or the default segment when omitted. */
  static create(segmentId?: string): Cache {
    return new Cache(segmentId);
  }

  /** Writes a cache entry. `expiryHours` defaults to the segment's own expiry. */
  async putValue(
    key: string,
    value: string,
    expiryHours?: number,
  ): Promise<void> {
    const segment = await this.segment();
    try {
      await segment.put(key, value, expiryHours);
    } catch (cause) {
      throw CatalystError.InvalidResource(`putValue failed for ${key}`, cause);
    }
  }

  /** Reads a cache entry; undefined when absent or expired. */
  async getValue(key: string): Promise<string | undefined> {
    const segment = await this.segment();
    try {
      const value = await segment.getValue(key);
      return value ?? undefined;
    } catch (cause) {
      throw CatalystError.InvalidResource(`getValue failed for ${key}`, cause);
    }
  }

  /** Deletes a cache entry. */
  async deleteValue(key: string): Promise<boolean> {
    const segment = await this.segment();
    try {
      return await segment.delete(key);
    } catch (cause) {
      throw CatalystError.InvalidResource(`deleteValue failed for ${key}`, cause);
    }
  }

  // getSegmentDetails is a round trip, so it only runs when a specific segment is named.
  private async segment(): Promise<Segment> {
    const client = cacheClient();
    if (!this.segmentId) {
      return client.segment();
    }
    try {
      return await client.getSegmentDetails(this.segmentId);
    } catch (cause) {
      throw CatalystError.ResourceNotFound(`Cache segment ${this.segmentId} not found`, cause);
    }
  }
}
