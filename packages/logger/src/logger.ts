import { findCurrentContext } from "@repo/async-context/async-context";
import pino from "pino";

export type LogLevel = "info" | "warn" | "error";

/** Where a configured app writes each rendered block - stdout unless the app passes one. */
export interface LogOutput {
  write(level: LogLevel, block: string): void;
}

interface LoggerSetup {
  /** Time zone for `Created At`. */
  timeZone?: string;
  output?: LogOutput;
}

/** The request a line was written in, and the line's place among that request's lines. */
interface CurrentExecution {
  executionId: string;
  order: number;
}

/** One pino record, as the root logger below writes it. `CurrentExecution`'s fields are
 *  missing on a line written outside a request. */
interface LogRecord extends Partial<CurrentExecution> {
  level: LogLevel;
  time: number;
  source: string;
  msg: string;
}

/**
 * Facade over pino: every line is a block naming its source and, inside a request, the
 * request's execution id and the line's order within it. One `Logger` per source is shared by
 * every request - the id is read from the async context on each line, never stored.
 */
export class Logger {
  private static readonly DIVIDER = "---------------------";
  private static readonly LOG_ORDER_KEY = "logOrder";
  private static timeZone = "Asia/Kolkata";
  private static output: LogOutput = {
    write: (level, block) => {
      (level === "error" ? process.stderr : process.stdout).write(`${block}\n`);
    },
  };
  private static root: pino.Logger | undefined;

  private constructor(private readonly source: string) {}

  /** Called once by an entry point, before anything logs. */
  static configure(setup: LoggerSetup): void {
    if (Logger.root) {
      throw new Error("Logger.configure must run before the first line is written.");
    }
    Logger.timeZone = setup.timeZone ?? Logger.timeZone;
    Logger.output = setup.output ?? Logger.output;
  }

  /** Built at module scope, before the entry point configures anything - it holds only its
   *  source, and the pino logger every source shares is built on the first line written. */
  static for(source: string): Logger {
    return new Logger(source);
  }

  info(...values: unknown[]): void {
    Logger.rootLogger().info({ source: this.source }, Logger.describeAll(values));
  }

  warn(...values: unknown[]): void {
    Logger.rootLogger().warn({ source: this.source }, Logger.describeAll(values));
  }

  error(...values: unknown[]): void {
    Logger.rootLogger().error({ source: this.source }, Logger.describeAll(values));
  }

  private static rootLogger(): pino.Logger {
    Logger.root ??= pino(
      {
        base: null,
        formatters: { level: (label) => ({ level: label }) },
        mixin: () => Logger.currentExecution(),
      },
      { write: (line) => Logger.writeBlock(line) },
    );
    return Logger.root;
  }

  /** Runs once per line, so the order counts up within the request that wrote it. Outside a
   *  request there is nothing to add, and the block leaves those lines out. */
  private static currentExecution(): CurrentExecution | Record<string, never> {
    const context = findCurrentContext();
    if (!context) {
      return {};
    }
    const order = (context.manager.getExtras<number>(Logger.LOG_ORDER_KEY) ?? 0) + 1;
    context.manager.setExtras(Logger.LOG_ORDER_KEY, order);
    return { executionId: context.manager.executionId, order };
  }

  private static writeBlock(line: string): void {
    const record: LogRecord = JSON.parse(line);
    Logger.output.write(record.level, Logger.render(record));
  }

  private static render(record: LogRecord): string {
    const executionLines =
      record.executionId === undefined
        ? []
        : [`Execution ID: ${record.executionId}`, `Order: ${record.order}`];
    return [
      Logger.DIVIDER,
      `Source: ${record.source}`,
      ...executionLines,
      `Level: ${record.level.charAt(0).toUpperCase()}${record.level.slice(1)}`,
      `Created At: ${Logger.formatDateTime(new Date(record.time))}`,
      "Content:",
      record.msg,
      Logger.DIVIDER,
    ].join("\n");
  }

  private static describeAll(values: unknown[]): string {
    return values.map((value) => Logger.describe(value)).join("\n");
  }

  private static describe(value: unknown): string {
    if (value instanceof Error) {
      // CatalystError and HttpRequestError print their stack in toString; a plain Error does not.
      const text = value.toString();
      return value.stack === undefined || text.includes(value.stack) ? text : value.stack;
    }
    if (typeof value === "object" && value !== null) {
      try {
        return JSON.stringify(value);
      } catch {
        // A circular reference - the line still gets written.
        return String(value);
      }
    }
    return String(value);
  }

  private static formatDateTime(date: Date): string {
    const datePart = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: Logger.timeZone,
    }).format(date);
    const timePart = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: Logger.timeZone,
    }).format(date);
    return `${datePart}, ${timePart}`;
  }
}
