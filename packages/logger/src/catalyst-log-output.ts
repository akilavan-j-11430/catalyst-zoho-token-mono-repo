import { createWriteStream, type WriteStream } from "node:fs";
import type { LogLevel } from "@/logger";

/** The record Catalyst's log collector reads from each packet. */
interface CatalystLogRecord {
  _zl_timestamp: number;
  level: LogLevel;
  message: string;
}

/**
 * Adapter: writes each rendered block to the log collector Catalyst hands a running app as a
 * file descriptor - `X_ZOHO_SPARKLET_LOG_FD` - framed as a SparkP packet:
 *
 *  +-------------------+---------------+-------------------------+-------------------------------+
 *  | Encoding (1 byte) | Path (1 byte) | Content-Length (4 byte) | Message (Content-Length byte) |
 *  +-------------------+---------------+-------------------------+-------------------------------+
 *
 * Passed to `Logger.configure` as the output itself: `output: CatalystLogOutput`. Where
 * Catalyst hands over no descriptor - locally, for one - each block goes to stdout instead.
 */
export class CatalystLogOutput {
  private static readonly ENCODING = 2;
  private static readonly LOG_PATH = 0;
  private static collector: WriteStream | undefined;

  static write(level: LogLevel, block: string): void {
    // Catalyst injects the variable itself and no app configures it, so it is read here,
    // where its meaning lives - on every write, so a test can set it.
    const logFd = process.env["X_ZOHO_SPARKLET_LOG_FD"];
    if (logFd === undefined) {
      (level === "error" ? process.stderr : process.stdout).write(`${block}\n`);
      return;
    }
    CatalystLogOutput.collectorAt(Number(logFd)).write(CatalystLogOutput.packet(level, block));
  }

  /** Writes every packet still queued, then resolves. An entry point calls it once while it
   *  shuts down, so the last lines reach the collector before the process exits. The
   *  descriptor itself stays open: it is Catalyst's, and closes with the process. */
  static async flush(): Promise<void> {
    const collector = CatalystLogOutput.collector;
    if (collector === undefined) {
      return;
    }
    CatalystLogOutput.collector = undefined;
    await new Promise<void>((resolve) => collector.end(resolve));
  }

  /**
   * One stream for the descriptor, so writing never blocks the event loop and packets reach
   * the collector whole and in order - separate async writes could finish out of order and
   * split one packet's header from its message. Lines still queued when the process is killed
   * outright are lost; a shutdown that calls `flush` first keeps them.
   */
  private static collectorAt(logFd: number): WriteStream {
    if (CatalystLogOutput.collector === undefined) {
      // The path is ignored when a descriptor is given.
      const collector = createWriteStream("", { fd: logFd, autoClose: false });
      // Logging must never take the app down: a failed write is reported, not thrown.
      collector.on("error", (error) => {
        process.stderr.write(`Catalyst log collector write failed: ${error.message}\n`);
      });
      CatalystLogOutput.collector = collector;
    }
    return CatalystLogOutput.collector;
  }

  /** The header and the record in one buffer, so a single write carries the whole packet. */
  private static packet(level: LogLevel, block: string): Buffer {
    const record: CatalystLogRecord = { _zl_timestamp: Date.now(), level, message: block };
    const message = Buffer.from(JSON.stringify(record), "utf8");
    const header = Buffer.alloc(6);
    header.writeUInt8(CatalystLogOutput.ENCODING, 0);
    header.writeUInt8(CatalystLogOutput.LOG_PATH, 1);
    header.writeUInt32BE(message.length, 2);
    return Buffer.concat([header, message]);
  }
}
