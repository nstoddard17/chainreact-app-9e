/**
 * @jest-environment node
 *
 * Tests for app/api/webhooks/trello/route.ts.
 *
 * The route is a thin shell — verify the wiring contract with mocks:
 *   - HEAD → 200 (Trello webhook-registration probe)
 *   - GET → 200 JSON service info
 *   - POST:
 *     - MissingSecretError → 503
 *     - InvalidSignatureError → 401
 *     - unknown_workflow → 200 quiet ack
 *     - unsupported_event → 200 skip
 *     - event_type_mismatch → 200 skip
 *     - board_mismatch → 200 skip
 *     - events → dispatch + 200 with count
 *     - dispatch error → 500 (Trello retries)
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/trello/triggers/_shared/receive", () => {
  // Re-export the real MissingSecretError class so route's
  // `instanceof` check works against thrown instances.
  const actual = jest.requireActual(
    "@/integrations/trello/triggers/_shared/receive",
  );
  return {
    ...actual,
    receiveTrelloWebhook: (...args: unknown[]) => mockReceive(...args),
  };
});

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

import { POST, HEAD, GET } from "@/app/api/webhooks/trello/route";
import { InvalidSignatureError } from "@/core/triggers/errors";
import { MissingSecretError } from "@/integrations/trello/triggers/_shared/receive";

function newRequest(body = "{}"): Request {
  return new Request("http://x/api/webhooks/trello?workflowId=wf-1&nodeId=node-1", {
    method: "POST",
    headers: { "x-trello-webhook": "sig" },
    body,
  });
}

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

describe("HEAD /api/webhooks/trello", () => {
  it("returns 200 with no body (Trello webhook-registration probe)", async () => {
    const res = await HEAD();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.length).toBe(0);
  });
});

describe("GET /api/webhooks/trello", () => {
  it("returns 200 JSON service info", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("trello webhook");
  });
});

describe("POST /api/webhooks/trello — error mapping", () => {
  it("returns 503 on MissingSecretError", async () => {
    mockReceive.mockRejectedValueOnce(new MissingSecretError());
    const res = await POST(newRequest());
    expect(res.status).toBe(503);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 401 on InvalidSignatureError", async () => {
    mockReceive.mockRejectedValueOnce(
      new InvalidSignatureError("Trello webhook: signature verification failed (mismatch)."),
    );
    const res = await POST(newRequest());
    expect(res.status).toBe(401);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 500 on other receive errors", async () => {
    mockReceive.mockRejectedValueOnce(new Error("db boom"));
    const res = await POST(newRequest());
    expect(res.status).toBe(500);
  });
});

describe("POST /api/webhooks/trello — skip paths", () => {
  it("200 quiet ack on unknown_workflow", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "unknown_workflow" });
    const res = await POST(newRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, dispatched: 0 });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("200 skip on unsupported_event", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "unsupported_event",
      actionType: "createLabel",
    });
    const res = await POST(newRequest());
    expect(res.status).toBe(200);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("200 skip on event_type_mismatch", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "event_type_mismatch",
      triggerEventType: "new_card",
      inboundEventType: "trello.card.updated",
    });
    const res = await POST(newRequest());
    expect(res.status).toBe(200);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("200 skip on board_mismatch", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "board_mismatch",
      expected: "b1",
      received: "b2",
    });
    const res = await POST(newRequest());
    expect(res.status).toBe(200);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/trello — dispatch", () => {
  const sampleEvent = {
    provider: "trello",
    eventType: "trello.card.created",
    eventId: "act-1",
    occurredAt: "2026-05-11T00:00:00Z",
    providerAccountId: "b1",
    payload: {},
  };

  it("dispatches a single event and returns 200 with count", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [sampleEvent] });
    mockDispatch.mockResolvedValueOnce({ matched: 1, enqueued: 1 });
    const res = await POST(newRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dispatched).toBe(1);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when dispatch fails (Trello retries)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [sampleEvent] });
    mockDispatch.mockRejectedValueOnce(new Error("enqueue boom"));
    const res = await POST(newRequest());
    expect(res.status).toBe(500);
  });
});
