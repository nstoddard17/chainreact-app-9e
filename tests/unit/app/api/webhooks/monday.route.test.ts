/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/monday — Slice 3.MONDAY-7. Mocks
 * the receive helper + dispatch so we exercise status-code mapping in
 * isolation (receive + signature have their own dedicated test files).
 *
 * Contract:
 *   - challenge → 200 { challenge }
 *   - MissingSecretError → 503
 *   - InvalidSignatureError → 401
 *   - unknown_workflow → 200 quiet ack
 *   - unsupported_event → 200 skipped
 *   - event_type_mismatch → 200 skipped
 *   - events → dispatch + 200 with count
 *   - dispatch failure → 500 (Monday retries)
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/monday/triggers/_shared/receive", () => {
  const actual = jest.requireActual(
    "@/integrations/monday/triggers/_shared/receive",
  );
  return {
    ...actual,
    receiveMondayWebhook: (...args: unknown[]) => mockReceive(...args),
  };
});

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Bypass the registry side-effect import — registration is covered by the
// per-trigger index tests + the activation-invariant structural test.
jest.mock("@/integrations/_registry", () => ({}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { MissingSecretError } from "@/integrations/monday/triggers/_shared/receive";
import { GET, POST } from "@/app/api/webhooks/monday/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req(): Request {
  return new Request(
    "https://app.example.test/api/webhooks/monday?workflowId=wf&nodeId=n",
    { method: "POST", body: '{"event":{"type":"create_item"}}' },
  );
}

describe("/api/webhooks/monday — challenge + error mapping", () => {
  it("echoes the challenge with 200 { challenge }", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "challenge", challenge: "tok-1" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge: "tok-1" });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 503 on MissingSecretError (fail closed; V1 silently skipped verification)", async () => {
    mockReceive.mockRejectedValueOnce(new MissingSecretError());
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/secret/i);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 401 on InvalidSignatureError", async () => {
    mockReceive.mockRejectedValueOnce(new InvalidSignatureError("bad"));
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid signature");
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 500 on an unexpected receive error", async () => {
    mockReceive.mockRejectedValueOnce(new Error("network"));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});

describe("/api/webhooks/monday — non-dispatch acks", () => {
  it("200 quiet ack on unknown_workflow", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "unknown_workflow" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0 });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("200 skipped on unsupported_event", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "unsupported_event",
      eventType: "delete_pulse",
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0, skipped: true });
  });

  it("200 skipped on event_type_mismatch", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "event_type_mismatch",
      triggerEventType: "new_item",
      inboundType: "column_changed",
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0, skipped: true });
  });
});

describe("/api/webhooks/monday — dispatch", () => {
  const event = {
    provider: "monday",
    eventType: "new_item",
    eventId: "new_item:1:2:t",
    occurredAt: "2026-05-24T10:00:00Z",
    providerAccountId: "1",
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

  it("reports dispatched:0 on a duplicate delivery (dedup blocked)", async () => {
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

  it("returns 500 on dispatch failure (Monday retries on non-2xx)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [event] });
    mockDispatch.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});

describe("/api/webhooks/monday GET", () => {
  it("returns service info JSON (no secret leaked, mentions x-monday-signature)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.service).toBe("monday webhook");
    expect(json.description).toMatch(/x-monday-signature/);
    expect(json.description).toMatch(/MONDAY_SIGNING_SECRET/);
  });
});
