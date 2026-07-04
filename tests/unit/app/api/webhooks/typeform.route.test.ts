/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/typeform — Slice 5.TYPEFORM-1.
 * Mocks the receive helper + dispatch so we exercise status-code mapping
 * in isolation (receive + signature have their own dedicated test files).
 *
 * Contract:
 *   - InvalidSignatureError → 401
 *   - unknown_workflow → 200 quiet ack (NEVER 404 — Typeform disables
 *     the webhook immediately on 404/410)
 *   - unverifiable (secretless row) → 200 skipped, no dispatch
 *   - ignored_event (non-form_response) → 200, no dispatch
 *   - events → dispatch + 200 with count
 *   - dispatch failure → 500 (Typeform retries)
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock(
  "@/integrations/typeform/triggers/newResponseInForm/receive",
  () => {
    const actual = jest.requireActual(
      "@/integrations/typeform/triggers/newResponseInForm/receive",
    );
    return {
      ...actual,
      receiveTypeformWebhook: (...args: unknown[]) => mockReceive(...args),
    };
  },
);

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Bypass the registry side-effect import — registration is covered by the
// per-trigger index module + the activation-invariant structural test.
jest.mock("@/integrations/_registry", () => ({}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { GET, POST } from "@/app/api/webhooks/typeform/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req(): Request {
  return new Request(
    "https://app.example.test/api/webhooks/typeform?workflowId=wf&nodeId=n",
    { method: "POST", body: '{"event_type":"form_response"}' },
  );
}

describe("/api/webhooks/typeform — error mapping", () => {
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

describe("/api/webhooks/typeform — non-dispatch acks (never 404/410)", () => {
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

  it("200 ignored on a non-form_response event type", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "ignored_event",
      eventType: "form_response_partial",
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0, ignored: true });
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("/api/webhooks/typeform — dispatch", () => {
  const event = {
    provider: "typeform",
    eventType: "new_response_in_form",
    eventId: "new_response_in_form:form-1:resp-1",
    occurredAt: "2026-07-04T10:00:00Z",
    providerAccountId: "form-1",
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

  it("returns 500 on dispatch failure (Typeform retries on non-2xx)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [event] });
    mockDispatch.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });
});

describe("/api/webhooks/typeform GET", () => {
  it("returns service info JSON (mentions the signature model, leaks nothing)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.service).toBe("typeform webhook");
    expect(json.description).toMatch(/Typeform-Signature/);
  });
});
