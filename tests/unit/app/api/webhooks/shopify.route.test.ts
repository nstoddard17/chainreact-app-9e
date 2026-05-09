/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/shopify. Mocks receive +
 * dispatch so we exercise the route's status-code mapping in
 * isolation. Receive helper + signature verifier all have their own
 * dedicated test files.
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/shopify/triggers/webhookReceived/receive", () => ({
  receiveShopifyWebhook: (...args: unknown[]) => mockReceive(...args),
}));

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Bypass the registry side-effect import so the registration tests
// cover that path directly.
jest.mock("@/integrations/_registry", () => ({}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { GET, POST } from "@/app/api/webhooks/shopify/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req(): Request {
  return new Request(
    "https://app.example.test/api/webhooks/shopify?workflowId=wf-1&nodeId=n-1",
    {
      method: "POST",
      body: '{"id":1}',
    },
  );
}

describe("/api/webhooks/shopify route", () => {
  it("returns 401 on InvalidSignatureError with 'invalid signature' body", async () => {
    mockReceive.mockRejectedValueOnce(
      new InvalidSignatureError("signature mismatch"),
    );
    const res = await POST(req());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("invalid signature");
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected receive error", async () => {
    mockReceive.mockRejectedValueOnce(new Error("network"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 200 with dispatched: 0 on unknown_workflow (quiet ack)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "unknown_workflow" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0 });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 200 with skipped: true on unsupported_topic (allowlist filter ack)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "unsupported_topic",
      topic: "orders/cancelled",
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      dispatched: 0,
      skipped: true,
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("dispatches each event and returns the dispatched count on success", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "shopify",
          eventType: "webhook_received",
          eventId: "wh-1",
          occurredAt: "t",
          accountId: "s.myshopify.com",
          payload: { topic: "orders/create" },
        },
      ],
    });
    mockDispatch.mockResolvedValueOnce({
      matched: 1,
      enqueued: 1,
      duplicate: false,
      dedupOutage: false,
    });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 1 });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it("returns 0 dispatched count on duplicate (dedup blocks downstream enqueue)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "shopify",
          eventType: "webhook_received",
          eventId: "wh-replay",
          occurredAt: "t",
          accountId: "s.myshopify.com",
          payload: { topic: "orders/create" },
        },
      ],
    });
    mockDispatch.mockResolvedValueOnce({
      matched: 0,
      enqueued: 0,
      duplicate: true,
      dedupOutage: false,
    });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0 });
  });

  it("returns 500 on dispatch failure (Shopify retries on non-2xx)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "shopify",
          eventType: "webhook_received",
          eventId: "wh-1",
          occurredAt: "t",
          accountId: "s.myshopify.com",
          payload: { topic: "orders/create" },
        },
      ],
    });
    mockDispatch.mockRejectedValueOnce(new Error("dispatch crashed"));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});

describe("GET /api/webhooks/shopify", () => {
  it("returns service-info JSON (no validation handshake required)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.service).toBe("shopify webhook");
    expect(json.description).toContain("X-Shopify-Hmac-SHA256");
  });
});
