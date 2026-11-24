import { describe, expect, it } from "vitest";
import { ContentType } from "@/content-type";
import { HttpHeader } from "@/http-header";
import { HttpClient } from "@/http-client";
import type { TransportRequest } from "@/http-types";

/** A client whose transport records what it was asked to send and answers 200, and whose
 *  logger records each call line. */
function recordingClient(
  headers?: () => Record<string, string>,
): { billing: HttpClient; sentRequests: TransportRequest[]; callLines: string[] } {
  const sentRequests: TransportRequest[] = [];
  const callLines: string[] = [];
  const billing = new HttpClient({
    baseUrl: "https://billing.example.com/v2",
    logger: { info: (message) => callLines.push(message) },
    headers,
    transport: async (request) => {
      sentRequests.push(request);
      return { status: 200, headers: {}, body: new Uint8Array() };
    },
  });
  return { billing, sentRequests, callLines };
}

describe("HttpClient request encoding", () => {
  it("sends an object as JSON", async () => {
    const { billing, sentRequests } = recordingClient();

    await billing.post("/invoices", { amount: 42 });

    expect(sentRequests[0]?.body).toBe('{"amount":42}');
    expect(sentRequests[0]?.headers[HttpHeader.ContentType]).toBe(ContentType.Json);
  });

  it("sends a string untouched as text", async () => {
    const { billing, sentRequests } = recordingClient();

    await billing.post("/notes", "paid in full");

    expect(sentRequests[0]?.body).toBe("paid in full");
    expect(sentRequests[0]?.headers[HttpHeader.ContentType]).toBe(ContentType.Text);
  });

  it("rejects bytes over a shared buffer, which fetch cannot send", async () => {
    const { billing, sentRequests } = recordingClient();

    const sending = billing.post("/uploads", new Uint8Array(new SharedArrayBuffer(4)));

    await expect(sending).rejects.toThrow(TypeError);
    expect(sentRequests).toHaveLength(0);
  });
});

describe("HttpClient declared content type", () => {
  it("rejects a declared type that contradicts the JSON encoding", async () => {
    const { billing, sentRequests } = recordingClient();

    const sending = billing.post("/invoices", { amount: 42 }, {
      headers: { [HttpHeader.ContentType]: ContentType.Xml },
    });

    await expect(sending).rejects.toThrow(TypeError);
    expect(sentRequests).toHaveLength(0);
  });

  it("rejects a declared multipart type on FormData", async () => {
    const { billing, sentRequests } = recordingClient();

    const sending = billing.post("/uploads", new FormData(), {
      headers: { [HttpHeader.ContentType]: ContentType.Multipart },
    });

    await expect(sending).rejects.toThrow(TypeError);
    expect(sentRequests).toHaveLength(0);
  });
});

describe("HttpClient call line", () => {
  it("logs one line per call to the logger it was given", async () => {
    const { billing, callLines } = recordingClient();

    await billing.get("/invoices/1");

    expect(callLines).toEqual([
      expect.stringMatching(
        /^GET https:\/\/billing\.example\.com\/v2\/invoices\/1 -> 200 in \d+ ms$/,
      ),
    ]);
  });
});

describe("HttpClient execution id", () => {
  it("sends the execution id the caller's headers supply", async () => {
    const { billing, sentRequests } = recordingClient(() => ({
      [HttpHeader.AppExecutionId]: "execution-1",
    }));

    await billing.get("/invoices/1");

    expect(sentRequests[0]?.headers[HttpHeader.AppExecutionId]).toBe("execution-1");
  });

  it("adds none of its own", async () => {
    const { billing, sentRequests } = recordingClient();

    await billing.get("/invoices/1");

    expect(sentRequests[0]?.headers).not.toHaveProperty(HttpHeader.AppExecutionId);
  });
});
