/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/stripe. Mocks receive +
 * dispatch so we exercise the route's status-code mapping in
 * isolation. Receive helper + signature verifier all have their own
 * dedicated test files.
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/stripe/webhooks/receive", () => ({
  receiveStripeWebhook: (...args: unknown[]) => mockReceive(...args),
}));

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Bypass the side-effect import so registry side effects don't run
// (the registration tests cover that path directly).
jest.mock("@/integrations/_registry", () => ({}));

import {
  InvalidSignatureError,
  SignatureExpiredError,
} from "@/core/triggers/errors";
import { GET, POST } from "@/app/api/webhooks/stripe/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req(): Request {
  return new Request(
    "https://app.example.test/api/webhooks/stripe?workflowId=wf-1&nodeId=node-1",
    {
      method: "POST",
      body: '{"id":"evt_1","type":"payment_intent.succeeded"}',
    },
  );
}

describe("/api/webhooks/stripe route", () => {
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

  it("returns 401 on SignatureExpiredError with 'signature expired' body (distinct from generic invalid)", async () => {
    mockReceive.mockRejectedValueOnce(
      new SignatureExpiredError("timestamp outside tolerance"),
    );
    const res = await POST(req());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("signature expired");
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

  it("returns 200 with skipped: true on unsupported_event_type (allowlist filter ack)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "unsupported_event_type",
      stripeEventType: "invoice.created",
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
          provider: "stripe",
          eventType: "event_received",
          eventId: "evt_1",
          occurredAt: "t",
          accountId: "acct_M_1",
          payload: { stripeEventType: "payment_intent.succeeded" },
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

  it("returns 0 dispatched when dedup blocks the event (Stripe retry — same event.id)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "stripe",
          eventType: "event_received",
          eventId: "evt_DUPLICATE",
          occurredAt: "t",
          accountId: "acct_M_1",
          payload: { stripeEventType: "payment_intent.succeeded" },
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

  it("returns 500 on dispatch error so Stripe retries", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "stripe",
          eventType: "event_received",
          eventId: "evt_1",
          occurredAt: "t",
          accountId: "acct_M_1",
          payload: { stripeEventType: "payment_intent.succeeded" },
        },
      ],
    });
    mockDispatch.mockRejectedValueOnce(new Error("queue down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });

  it("GET returns service info JSON", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.service).toBe("stripe webhook");
    expect(json.description).toContain("Stripe-Signature");
  });
});
