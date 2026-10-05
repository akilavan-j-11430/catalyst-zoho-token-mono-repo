import { AsyncLocalStorage } from "node:async_hooks";
import type { Catalyst } from "@/services/catalyst/catalyst";
import { RuntimeError } from "@/errors/runtime-error";

/** Per-request values carried on the execution context. */
export interface ExecutionInfo {
  catalyst: Catalyst;
  executionId: string;
  /** Any other values that need to be carried through the request. */
  extras: Record<string, unknown>;
}

class ExecutionManager {
  private values: ExecutionInfo;

  constructor(values: ExecutionInfo) {
    this.values = values;
  }

  get executionId(): string {
    return this.values.executionId;
  }

  get catalyst(): Catalyst {
    return this.values.catalyst;
  }

  getExtras<T>(key: string): T | undefined {
    return (this.values.extras?.[key] as T) ?? undefined;
  }

  setExtras(key: string, value: unknown): void {
    if (!this.values.extras) {
      this.values.extras = {};
    }
    this.values.extras[key] = value;
  }
}

export class ExecutionContext {
  private readonly _manager: ExecutionManager;

  constructor(values: ExecutionInfo) {
    this._manager = new ExecutionManager(values);
  }

  get manager(): ExecutionManager {
    return this._manager;
  }
}

const executionStore = new AsyncLocalStorage<ExecutionContext>();

/** The in-flight request's context. Throws outside a request. */
export function currentContext(): ExecutionContext {
  const context = executionStore.getStore();
  if (!context) {
    throw new RuntimeError(
      "no execution context found in async store",
    );
  }
  return context;
}

export function runWithContext<T>(context: ExecutionContext, fn: () => T): T {
  return executionStore.run(context, fn);
}
