import { closeSync, mkdtempSync, openSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CatalystLogOutput } from "@/catalyst-log-output";

interface DecodedPacket {
  encoding: number;
  path: number;
  record: { _zl_timestamp: number; level: string; message: string };
}

/** Splits what was written into SparkP packets: 6 header bytes, then the JSON record. */
function decodePackets(bytes: Buffer): DecodedPacket[] {
  const packets: DecodedPacket[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset + 2);
    packets.push({
      encoding: bytes.readUInt8(offset),
      path: bytes.readUInt8(offset + 1),
      record: JSON.parse(bytes.subarray(offset + 6, offset + 6 + length).toString("utf8")),
    });
    offset += 6 + length;
  }
  return packets;
}

describe("CatalystLogOutput", () => {
  it("frames each block as a SparkP packet on the descriptor, in order", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "catalyst-log-")), "log");
    const logFd = openSync(file, "w");
    vi.stubEnv("X_ZOHO_SPARKLET_LOG_FD", String(logFd));

    CatalystLogOutput.write("info", "first block");
    CatalystLogOutput.write("error", "second block");

    // The stream writes in the background; flush is what waits for the queue to drain.
    await CatalystLogOutput.flush();
    closeSync(logFd);
    const packets = decodePackets(readFileSync(file));
    expect(packets).toEqual([
      { encoding: 2, path: 0, record: { _zl_timestamp: expect.any(Number), level: "info", message: "first block" } },
      { encoding: 2, path: 0, record: { _zl_timestamp: expect.any(Number), level: "error", message: "second block" } },
    ]);
  });

  it("writes the block to stdout when the platform set no descriptor", () => {
    vi.stubEnv("X_ZOHO_SPARKLET_LOG_FD", undefined);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    CatalystLogOutput.write("info", "a block");

    expect(stdout).toHaveBeenCalledExactlyOnceWith("a block\n");
  });
});
