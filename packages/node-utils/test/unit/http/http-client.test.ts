import { describe, expect, it } from "vitest";
import { Catalyst } from "@/catalyst/catalyst";
import { ContentType } from "@/enums/content-type";
import { HttpHeader } from "@/enums/http-header";
import { RuntimeError } from "@/errors/runtime-error";
import { ExecutionContext, runWithContext } from "@/framework/async-context";
import { HttpClient } from "@/http/http-client";
import type { TransportRequest } from "@/types/http";

/** A client whose transport records what it was asked to send and answers 200. */
function recordingClient(): { billing: HttpClient; sentRequests: TransportRequest[] } {
  const sentRequests: TransportRequest[] = [];
  const billing = new HttpClient({
    baseUrl: "https://billing.example.com/v2",
    transport: async (request) => {
      sentRequests.push(request);
      return { status: 200, headers: {}, body: new Uint8Array() };
    },
  });
  return { billing, sentRequests };
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
});

describe("HttpClient declared content type", () => {
  it("rejects a declared type that contradicts the JSON encoding", async () => {
    const { billing, sentRequests } = recordingClient();

    const sending = billing.post("/invoices", { amount: 42 }, {
      headers: { [HttpHeader.ContentType]: ContentType.Xml },
    });

    await expect(sending).rejects.toThrow(RuntimeError);
    expect(sentRequests).toHaveLength(0);
  });

  it("rejects a declared multipart type on FormData", async () => {
    const { billing, sentRequests } = recordingClient();

    const sending = billing.post("/uploads", new FormData(), {
      headers: { [HttpHeader.ContentType]: ContentType.Multipart },
    });

    await expect(sending).rejects.toThrow(RuntimeError);
    expect(sentRequests).toHaveLength(0);
  });
});

describe("HttpClient execution id", () => {
  it("stamps the request's execution id inside a request context", async () => {
    const { billing, sentRequests } = recordingClient();
    const context = new ExecutionContext({
      executionId: "execution-1",
      catalyst: new Catalyst(),
      extras: {},
    });

    await runWithContext(context, () => billing.get("/invoices/1"));

    expect(sentRequests[0]?.headers[HttpHeader.AppExecutionId]).toBe("execution-1");
  });

  it("leaves the header off outside a request context", async () => {
    const { billing, sentRequests } = recordingClient();

    await billing.get("/invoices/1");

    expect(sentRequests[0]?.headers).not.toHaveProperty(HttpHeader.AppExecutionId);
  });
});
