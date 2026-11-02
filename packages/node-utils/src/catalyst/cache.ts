import { Cache as CacheClient } from "@zcatalyst/cache";
import { CatalystScope } from "@/enums/catalyst-scope";
import { currentContext } from "@/framework/async-context";

/** The SDK exports only its top-level clients, so segment/bucket/table types are
 *  derived from the methods that produce them rather than imported. */
type Segment = ReturnType<CacheClient["segment"]>;

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope. Cache is admin-only.
 *  Never construct the client without an app: the SDK then falls back to whichever
 *  request called `zcAuth.init` last, and switches that request's credential to admin. */
function cacheClient(): CacheClient {
  return new CacheClient(
    currentContext().manager.catalyst.getApp(CatalystScope.Admin),
  );
}

/** A Catalyst cache segment. Omit the id to use the project's default segment. */
export class Cache {
  private constructor(private readonly segmentId?: string) {}

  // getSegmentDetails is a round trip, so it only runs when a specific segment is named.
  private async segment(): Promise<Segment> {
    if (!this.segmentId) {
      return cacheClient().segment();
    }
    return cacheClient().getSegmentDetails(this.segmentId);
  }

  /** Writes a cache entry. `expiryHours` defaults to the segment's own expiry. */
  async putValue(
    key: string,
    value: string,
    expiryHours?: number,
  ): Promise<void> {
    const segment = await this.segment();
    await segment.put(key, value, expiryHours);
  }

  /** Reads a cache entry; undefined when absent or expired. */
  async getValue(key: string): Promise<string | undefined> {
    const segment = await this.segment();
    const value = await segment.getValue(key);
    return value ?? undefined;
  }

  /** Deletes a cache entry. */
  async deleteValue(key: string): Promise<boolean> {
    const segment = await this.segment();
    return segment.delete(key);
  }

  /** Creates a handle to a named segment, or the default segment when omitted. */
  static create(segmentId?: string): Cache {
    return new Cache(segmentId);
  }
}
