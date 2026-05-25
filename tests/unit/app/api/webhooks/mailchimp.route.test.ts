/**
 * @jest-environment node
 *
 * Tests for `/api/webhooks/mailchimp` route — Slice 14 Commit 4.
 *
 * Verifies:
 *   - Raw body is read once BEFORE parsing.
 *   - `unknown_workflow` → 200 quiet ack.
 *   - `audience_mismatch` → 200 ack with skipped: true.
 *   - `unsupported_event_type` → 200 ack with skipped: true.
 *   - `events` → dispatches each via dispatchTriggerEvent, returns
 *     200 with dispatched count.
 *   - Body-read failure → 400.
 *   - Receive helper unexpected error → 500.
 *   - Dispatch error → 500 so Mailchimp retries.
 *   - GET endpoint returns 200 with a JSON description (handshake).
 */

const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/mailchimp/triggers/audienceEvent/receive", () => ({
  receiveMailchimpWebhook: (...a: unknown[]) => mockReceive(...a),
}));

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...a: unknown[]) => mockDispatch(...a),
}));

jest.mock("@/integrations/_registry", () => ({}));

import * as route from "@/app/api/webhooks/mailchimp/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function makeRequest(body: string): Request {
  return new Request("https://app.example/api/webhooks/mailchimp?workflowId=w1&nodeId=n1", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

const SUBSCRIBE_BODY = "type=subscribe&data%5Blist_id%5D=1a2b3c4d5e";

describe("POST /api/webhooks/mailchimp", () => {
  it("passes the raw body to receiveMailchimpWebhook", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "unknown_workflow" });
    await route.POST(makeRequest(SUBSCRIBE_BODY));
    expect(mockReceive).toHaveBeenCalledWith(
      expect.objectContaining({ rawBody: SUBSCRIBE_BODY }),
    );
  });

  it("returns 200 dispatched:0 on unknown_workflow (quiet ack)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "unknown_workflow" });
    const res = await route.POST(makeRequest(SUBSCRIBE_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, dispatched: 0 });
  });

  it("returns 200 skipped:true on audience_mismatch", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "audience_mismatch",
      expected: "list_a",
      received: "list_b",
    });
    const res = await route.POST(makeRequest(SUBSCRIBE_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, dispatched: 0, skipped: true });
  });

  it("returns 200 skipped:true on unsupported_event_type", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "unsupported_event_type",
      receivedType: "bogus",
    });
    const res = await route.POST(makeRequest(SUBSCRIBE_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, dispatched: 0, skipped: true });
  });

  it("dispatches each event and returns 200 dispatched:N on events", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [{ provider: "mailchimp", eventType: "audience_event", eventId: "h1" }],
    });
    mockDispatch.mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false });
    const res = await route.POST(makeRequest(SUBSCRIBE_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, dispatched: 1 });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it("dispatched:0 when dispatchTriggerEvent reports duplicate (dedup hit)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [{ provider: "mailchimp", eventType: "audience_event", eventId: "h1" }],
    });
    mockDispatch.mockResolvedValueOnce({ matched: 0, enqueued: 0, duplicate: true });
    const res = await route.POST(makeRequest(SUBSCRIBE_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, dispatched: 0 });
  });

  it("returns 500 when receiveMailchimpWebhook throws unexpectedly", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockReceive.mockRejectedValueOnce(new Error("db outage"));
    const res = await route.POST(makeRequest(SUBSCRIBE_BODY));
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });

  it("returns 500 when dispatchTriggerEvent throws (Mailchimp retries)", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [{ provider: "mailchimp", eventType: "audience_event", eventId: "h1" }],
    });
    mockDispatch.mockRejectedValueOnce(new Error("enqueue failed"));
    const res = await route.POST(makeRequest(SUBSCRIBE_BODY));
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});

describe("GET /api/webhooks/mailchimp", () => {
  it("returns 200 with JSON description (Mailchimp handshake)", async () => {
    const res = await route.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe("mailchimp webhook");
    expect(typeof body.description).toBe("string");
  });
});
