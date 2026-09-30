import { RuntimeError } from "@/errors/runtime_error";

/**
 * A map that forgets its least recently used entry once it is full.
 *
 * `Map` iterates in insertion order, so the least recently used key is simply the first
 * one, provided every read re-inserts the entry it found. That is the whole trick.
 */
export class LruCache<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RuntimeError(
        `An LruCache needs a whole capacity of at least 1, got ${capacity}.`,
      );
    }
  }

  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.capacity) {
      const leastRecentlyUsed = this.entries.keys().next().value;
      if (leastRecentlyUsed !== undefined) {
        this.entries.delete(leastRecentlyUsed);
      }
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }
}
