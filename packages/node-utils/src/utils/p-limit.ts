import { RuntimeError } from "@/errors/runtime-error";

export function validateConcurrency(concurrency: number): number {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RuntimeError(
      `Concurrency must be a whole number of at least 1, got ${concurrency}.`,
    );
  }
  return concurrency;
}

/** Runs at most `concurrency` tasks at once; the rest wait in arrival order. */
export class PLimit {
  private inFlight = 0;
  private readonly waiting: Array<() => void> = [];
  private readonly concurrency: number;

  constructor(concurrency: number) {
    this.concurrency = validateConcurrency(concurrency);
  }

  get isIdle(): boolean {
    return this.inFlight === 0;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.inFlight < this.concurrency) {
      this.inFlight += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  /** A waiter takes over the finished task's slot, so the count only drops when no one
   *  is waiting. Freeing it first would let a newcomer take it before the waiter wakes. */
  private release(): void {
    const next = this.waiting.shift();
    if (next === undefined) {
      this.inFlight -= 1;
      return;
    }
    next();
  }
}
