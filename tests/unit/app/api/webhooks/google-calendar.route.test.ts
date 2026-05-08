/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/google-calendar. Mocks receive +
 * dispatch so we exercise the route's own status-code mapping in isolation.
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/google-calendar/webhooks/receive", () => ({
  receiveCalendarWebhook: (...args: unknown[]) => mockReceive(...args),
}));

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Bypass the side-effect import so registry side effects don't run.
jest.mock("@/integrations/_registry", () => ({}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { POST } from "@/app/api/webhooks/google-calendar/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req() {
  return new Request("https://app.example.test/api/webhooks/google-calendar", {
    method: "POST",
  });
}

describe("/api/webhooks/google-calendar route", () => {
  it("returns 200 ok on handshake", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "handshake" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 200 ok on unknown_channel (no dispatch)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "unknown_channel" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("dispatches each event and returns the dispatched count on events", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        { provider: "google-calendar", eventType: "event_changed", eventId: "a", occurredAt: "t", accountId: "u", payload: {} },
        { provider: "google-calendar", eventType: "event_changed", eventId: "b", occurredAt: "t", accountId: "u", payload: {} },
      ],
    });
    mockDispatch
      .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false })
      .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 2 });
    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });

  it("returns 401 when receive throws InvalidSignatureError", async () => {
    mockReceive.mockRejectedValueOnce(new InvalidSignatureError("bad token"));
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid signature" });
  });

  it("returns 500 when receive throws an unexpected error", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockReceive.mockRejectedValueOnce(new Error("DB unreachable"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });

  it("returns 500 when dispatch throws (so Google retries)", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        { provider: "google-calendar", eventType: "event_changed", eventId: "a", occurredAt: "t", accountId: "u", payload: {} },
      ],
    });
    mockDispatch.mockRejectedValueOnce(new Error("queue down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});
