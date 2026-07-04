/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/calendly — Slice 5.CALENDLY-1.
 * Mocks the receive helper + dispatch so we exercise status-code mapping
 * in isolation (receive + signature have their own dedicated test
 * files).
 *
 * Contract:
 *   - InvalidSignatureError → 401
 *   - unknown_workflow → 200 quiet ack
 *   - unverifiable (secretless row) → 200 skipped, no dispatch
 *   - ignored_event (unsupported/mismatched event) → 200, no dispatch
 *   - events → dispatch + 200 with count
 *   - dispatch failure → 500 (Calendly retries with backoff ≤24h)
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/calendly/triggers/_shared/receive", () => {
  const actual = jest.requireActual(
    "@/integrations/calendly/triggers/_shared/receive",
  );
  return {
    ...actual,
    receiveCalendlyWebhook: (...args: unknown[]) => mockReceive(...args),
  };
});

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Bypass the registry side-effect import — registration is covered by the
// per-trigger index modules + the activation-invariant structural test.
jest.mock("@/integrations/_registry", () => ({}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { GET, POST } from "@/app/api/webhooks/calendly/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req(): Request {
  return new Request(
    "https://app.example.test/api/webhooks/calendly?workflowId=wf&nodeId=n",
    { method: "POST", body: '{"event":"invitee.created"}' },
  );
}

describe("/api/webhooks/calendly — error mapping", () => {
  it("returns 401 on InvalidSignatureError", async () => {
    mockReceive.mockRejectedValueOnce(new InvalidSignatureError("bad"));
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid signature");
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 500 on an unexpected receive error", async () => {
    mockReceive.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});

describe("/api/webhooks/calendly — non-dispatch acks", () => {
  it("200 quiet ack on unknown_workflow", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "unknown_workflow" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0 });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("200 skipped on an unverifiable (secretless) row — nothing dispatched", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "unverifiable" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0, skipped: true });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("200 ignored on an unsupported or row-mismatched event type", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "ignored_event",
      eventType: "routing_form_submission.created",
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0, ignored: true });
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("/api/webhooks/calendly — dispatch", () => {
  const event = {
    provider: "calendly",
    eventType: "event_scheduled",
    eventId: "event_scheduled:USER123:INV222",
    occurredAt: "2026-07-04T12:00:00Z",
    providerAccountId: "USER123",
    payload: {},
  };

  it("dispatches each event and returns the enqueued count", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [event] });
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

  it("reports dispatched:0 on a duplicate delivery (dedup blocked the rerun)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [event] });
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

  it("returns 500 on dispatch failure (Calendly retries on non-2xx)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [event] });
    mockDispatch.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});

describe("/api/webhooks/calendly GET", () => {
  it("returns service info JSON (mentions the signature model, leaks nothing)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.service).toBe("calendly webhook");
    expect(json.description).toMatch(/Calendly-Webhook-Signature/);
  });
});
