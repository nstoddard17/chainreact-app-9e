/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/airtable. Mocks receive +
 * dispatch so we exercise the route's status-code mapping in
 * isolation. Receive helper + signature verifier + pull all have
 * their own dedicated test files.
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/airtable/webhooks/receive", () => ({
  receiveAirtableWebhook: (...args: unknown[]) => mockReceive(...args),
}));

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Bypass the side-effect import so registry side effects don't run.
jest.mock("@/integrations/_registry", () => ({}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { GET, POST } from "@/app/api/webhooks/airtable/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req(): Request {
  return new Request("https://app.example.test/api/webhooks/airtable", {
    method: "POST",
    body: '{"base":{"id":"appA"},"webhook":{"id":"achA"}}',
  });
}

describe("/api/webhooks/airtable route", () => {
  it("returns 401 on InvalidSignatureError", async () => {
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

  it("returns 200 with dispatched: 0 on unknown_webhook (quiet ack)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "unknown_webhook" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0 });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("dispatches each event and returns the dispatched count on success", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "airtable",
          eventType: "record_changed",
          eventId: "a",
          occurredAt: "t",
          providerAccountId: "u",
          payload: { eventType: "created" },
        },
        {
          provider: "airtable",
          eventType: "record_changed",
          eventId: "b",
          occurredAt: "t",
          providerAccountId: "u",
          payload: { eventType: "updated" },
        },
      ],
    });
    mockDispatch
      .mockResolvedValueOnce({
        matched: 1,
        enqueued: 1,
        duplicate: false,
        dedupOutage: false,
      })
      .mockResolvedValueOnce({
        matched: 1,
        enqueued: 1,
        duplicate: false,
        dedupOutage: false,
      });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 2 });
    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });

  it("returns 0 dispatched when dedup blocks every event", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "airtable",
          eventType: "record_changed",
          eventId: "a",
          occurredAt: "t",
          providerAccountId: "u",
          payload: {},
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

  it("returns 500 on dispatch error so Airtable retries", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "airtable",
          eventType: "record_changed",
          eventId: "a",
          occurredAt: "t",
          providerAccountId: "u",
          payload: {},
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
    expect(json.service).toBe("airtable webhook");
    expect(json.description).toContain("X-Airtable-Content-MAC");
  });
});
