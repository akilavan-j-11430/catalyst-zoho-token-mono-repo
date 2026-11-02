import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpRequestError } from "@/errors/http-request-error";
import { HttpClient } from "@/http/http-client";

// A real upstream on a free local port, so the requests go through the real fetch
// transport and the real network stack.
const billingServer = createServer((request, response) => {
  if (request.url === "/v2/invoices/missing") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"error":"not_found"}');
    return;
  }
  if (request.url === "/v2/status-page") {
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<h1>Down for maintenance</h1>");
    return;
  }
  if (request.url === "/v2/slow-report") {
    setTimeout(() => response.end("{}"), 1_000);
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end('{"invoiceId":"42"}');
});

let billing: HttpClient;

beforeAll(async () => {
  billingServer.listen(0, "127.0.0.1");
  await once(billingServer, "listening");
  const { port } = billingServer.address() as AddressInfo;
  billing = new HttpClient({ baseUrl: `http://127.0.0.1:${port}/v2` });
});

afterAll(() => {
  billingServer.closeAllConnections();
  billingServer.close();
});

describe("HttpClient over a real connection", () => {
  it("resolves a 2xx with a body that reads as JSON", async () => {
    const { status, body } = await billing.get("/invoices/42");

    expect(status).toBe(200);
    expect(await body.json()).toEqual({ invoiceId: "42" });
  });

  it("rejects json() on a body that is not JSON", async () => {
    const { body } = await billing.get("/status-page");

    await expect(body.json()).rejects.toBeInstanceOf(HttpRequestError);
    expect(await body.text()).toBe("<h1>Down for maintenance</h1>");
  });
});

describe("HttpClient failures over a real connection", () => {
  it("rejects a non-2xx with the status and body the upstream sent", async () => {
    const fetching = billing.get("/invoices/missing");

    await expect(fetching).rejects.toBeInstanceOf(HttpRequestError);
    await expect(fetching).rejects.toMatchObject({
      status: 404,
      body: '{"error":"not_found"}',
    });
  });

  it("rejects a timeout with no status, since nothing came back", async () => {
    const fetching = billing.get("/slow-report", { timeoutMs: 50 });

    await expect(fetching).rejects.toBeInstanceOf(HttpRequestError);
    await expect(fetching).rejects.toMatchObject({ status: undefined });
  });
});
