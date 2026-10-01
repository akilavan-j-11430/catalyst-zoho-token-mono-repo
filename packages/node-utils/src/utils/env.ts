import { RuntimeError } from "@/errors/runtime-error";

/** The keys one app reads, each mapped to the string the environment holds. */
export type EnvKeys = Record<string, string>;

/** Reads the environment against one app's declared keys. Built by `defineEnv`. */
export class Env<T extends EnvKeys> {
  /** Reads one key. Undefined when it is unset or empty. */
  optional<K extends keyof T & string>(name: K): string | undefined {
    const value = process.env[name];
    return value === undefined || value === "" ? undefined : value;
  }

  /** Reads one key. Throws `RuntimeError` naming it when it is unset or empty. */
  get<K extends keyof T & string>(name: K): string {
    const value = this.optional(name);
    if (value === undefined) {
      throw new RuntimeError(
        `Required environment variable ${name} is not set.`,
      );
    }
    return value;
  }
}

/**
 * Declares the environment one app reads. The template lives in the app, so a
 * shared package never decides what an app is configured with.
 */
export function defineEnv<T extends EnvKeys>(): Env<T> {
  return new Env<T>();
}
