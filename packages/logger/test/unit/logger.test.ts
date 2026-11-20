import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LogLevel, Logger } from "@/logger";

interface WrittenBlock {
  level: LogLevel;
  block: string;
}

/** A fresh Logger and async context per test, since `configure` runs once per module. */
async function configuredLogger(): Promise<{
  loggerFor: (source: string) => Logger;
  configure: typeof Logger.configure;
  asyncContext: typeof import("@repo/async-context/async-context");
  written: WrittenBlock[];
}> {
  const { Logger: FreshLogger } = await import("@/logger");
  const asyncContext = await import("@repo/async-context/async-context");
  const written: WrittenBlock[] = [];
  FreshLogger.configure({
    timeZone: "UTC",
    output: { write: (level, block) => written.push({ level, block }) },
  });
  return {
    loggerFor: (source) => FreshLogger.for(source),
    configure: (setup) => FreshLogger.configure(setup),
    asyncContext,
    written,
  };
}

beforeEach(() => {
  vi.resetModules();
});

describe("Logger inside a request", () => {
  it("names the source and the execution id, and counts the order up per line", async () => {
    const { loggerFor, asyncContext, written } = await configuredLogger();
    const logger = loggerFor("billing");
    const execution = new asyncContext.ExecutionContext({ executionId: "execution-1", extras: {} });

    asyncContext.runWithContext(execution, () => {
      logger.info("first");
      logger.warn("second");
    });

    expect(written.map(({ level }) => level)).toEqual(["info", "warn"]);
    expect(written[0]?.block).toMatch(
      /^-{21}\nSource: billing\nExecution ID: execution-1\nOrder: 1\nLevel: Info\nCreated At: .+\nContent:\nfirst\n-{21}$/,
    );
    expect(written[1]?.block).toContain("Order: 2\nLevel: Warn\n");
  });
});

describe("Logger outside a request", () => {
  it("leaves out the execution id and order", async () => {
    const { loggerFor, written } = await configuredLogger();

    loggerFor("server").error("listening");

    expect(written).toEqual([
      { level: "error", block: expect.stringMatching(/^-{21}\nSource: server\nLevel: Error\nCreated At: /) },
    ]);
  });
});

describe("Logger content", () => {
  it("writes each value of one call on its own line, in order", async () => {
    const { loggerFor, written } = await configuredLogger();

    loggerFor("billing").info("Invoice sent", { invoiceId: "42" }, 200, undefined);

    expect(written[0]?.block).toContain('Content:\nInvoice sent\n{"invoiceId":"42"}\n200\nundefined\n');
  });

  it("keeps a plain Error's stack, which its toString leaves out", async () => {
    const { loggerFor, written } = await configuredLogger();
    const failure = new Error("retry later");

    loggerFor("billing").error(failure);

    expect(written[0]?.block).toContain(`Content:\n${failure.stack}\n`);
  });

  it("writes a circular object instead of throwing", async () => {
    const { loggerFor, written } = await configuredLogger();
    const invoice: Record<string, unknown> = { invoiceId: "42" };
    invoice["self"] = invoice;

    loggerFor("billing").info(invoice);

    expect(written[0]?.block).toContain("Content:\n[object Object]\n");
  });
});

describe("Logger.configure", () => {
  it("throws once a line has been written", async () => {
    const { loggerFor, configure } = await configuredLogger();

    loggerFor("billing").info("first");

    expect(() => configure({ timeZone: "UTC" })).toThrow(/before the first line/);
  });
});
