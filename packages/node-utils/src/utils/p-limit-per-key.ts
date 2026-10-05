import { PLimit, validateConcurrency } from "@/utils/p-limit";

/** A separate `PLimit` per key. With a concurrency of 1 it is a per-key lock. */
export class PLimitPerKey {
  private readonly limits = new Map<string, PLimit>();
  private readonly concurrencyPerKey: number;

  constructor(concurrencyPerKey: number) {
    this.concurrencyPerKey = validateConcurrency(concurrencyPerKey);
  }

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const limit = this.limits.get(key) ?? this.track(key);
    try {
      return await limit.run(task);
    } finally {
      if (limit.isIdle && this.limits.get(key) === limit) {
        this.limits.delete(key);
      }
    }
  }

  private track(key: string): PLimit {
    const limit = new PLimit(this.concurrencyPerKey);
    this.limits.set(key, limit);
    return limit;
  }
}
