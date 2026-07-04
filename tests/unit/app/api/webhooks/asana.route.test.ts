/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/asana — Slice 5.ASANA-1. Mocks the
 * receive helper + dispatch so we exercise status-code mapping in
 * isolation (receive + signature have their own dedicated test files).
 *
 * Contract:
 *   - handshake → 200 with the X-Hook-Secret ECHO header
 *   - handshake_rejected → 400 WITHOUT an echo header
 *   - InvalidSignatureError → 401
 *   - unknown_workflow → 200 quiet ack
 *   - unverifiable (secretless row) → 200 skipped, no dispatch
 *   - heartbeat → 200 (Asana deletes webhooks whose deliveries fail 24h)
 *   - events → dispatch + 200 with count
 *   - dispatch failure → 500 (Asana retries)
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/asana/triggers/_shared/receive", () => {
  const actual = jest.requireActual(
    "@/integrations/asana/triggers/_shared/receive",
  );
  return {
    ...actual,
    receiveAsanaWebhook: (...args: unknown[]) => mockReceive(...args),
  };
});

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Bypass the registry side-effect import — registration is covered by the
// per-trigger index modules + the activation-invariant structural test.
jest.mock("@/integrations/_registry", () => ({}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { GET, POST } from "@/app/api/webhooks/asana/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req(): Request {
  return new Request(
    "https://app.example.test/api/webhooks/asana?workflowId=wf&nodeId=n",
    { method: "POST", body: '{"events":[]}' },
  );
}

describe("/api/webhooks/asana — handshake + error mapping", () => {
  it("echoes the X-Hook-Secret header with 200 on an accepted handshake", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "handshake", secret: "sek-1" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Hook-Secret")).toBe("sek-1");
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 400 WITHOUT an echo on a rejected handshake (creation fails closed)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "handshake_rejected",
      reason: "not_pending",
    });
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(res.headers.get("X-Hook-Secret")).toBeNull();
  });

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

describe("/api/webhooks/asana — non-dispatch acks", () => {
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

  it("200 on the 8h heartbeat", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "heartbeat" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      dispatched: 0,
      heartbeat: true,
    });
  });
});

describe("/api/webhooks/asana — dispatch", () => {
  const event = {
    provider: "asana",
    eventType: "new_task_in_project",
    eventId: "new_task_in_project:p-1:t-1:ts",
    occurredAt: "2026-07-04T05:00:00Z",
    providerAccountId: "p-1",
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

  it("returns 500 on dispatch failure (Asana retries on non-2xx)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [event] });
    mockDispatch.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});

describe("/api/webhooks/asana GET", () => {
  it("returns service info JSON (mentions per-webhook signature model, leaks nothing)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.service).toBe("asana webhook");
    expect(json.description).toMatch(/X-Hook-Signature/);
    expect(json.description).toMatch(/X-Hook-Secret/);
  });
});
