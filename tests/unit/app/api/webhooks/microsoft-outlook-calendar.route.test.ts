/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/microsoft-outlook-calendar. Mocks
 * receive + dispatch so we exercise the route's own status-code mapping
 * and validation echo in isolation.
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/microsoft-outlook-calendar/webhooks/receive", () => ({
  receiveOutlookCalendarWebhook: (...args: unknown[]) => mockReceive(...args),
}));

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Bypass the side-effect import so registry side effects don't run.
jest.mock("@/integrations/_registry", () => ({}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import {
  GET,
  POST,
} from "@/app/api/webhooks/microsoft-outlook-calendar/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req(opts: { url?: string } = {}): Request {
  return new Request(
    opts.url ?? "https://app.example.test/api/webhooks/microsoft-outlook-calendar",
    { method: "POST" },
  );
}

describe("/api/webhooks/microsoft-outlook-calendar route", () => {
  it("returns the validation token verbatim as text/plain on validation handshake", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "validation",
      token: "ms-graph-token-xyz",
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(await res.text()).toBe("ms-graph-token-xyz");
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("dispatches each event and returns the dispatched count on notifications", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "microsoft-outlook-calendar",
          eventType: "event_changed",
          eventId: "a",
          occurredAt: "t",
          accountId: "u",
          payload: {},
        },
        {
          provider: "microsoft-outlook-calendar",
          eventType: "event_changed",
          eventId: "b",
          occurredAt: "t",
          accountId: "u",
          payload: {},
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

  it("excludes deduped events from the dispatched count (relies on dispatchTriggerEvent's enqueued total)", async () => {
    // Dedup happens inside dispatchTriggerEvent, which returns enqueued=0
    // for duplicates. The route reports the sum of enqueued counters —
    // dedup behavior is observable as "ok: true, dispatched: < eventCount".
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "microsoft-outlook-calendar",
          eventType: "event_changed",
          eventId: "a",
          occurredAt: "t",
          accountId: "u",
          payload: {},
        },
        {
          provider: "microsoft-outlook-calendar",
          eventType: "event_changed",
          eventId: "a", // duplicate
          occurredAt: "t",
          accountId: "u",
          payload: {},
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
        matched: 0,
        enqueued: 0,
        duplicate: true,
        dedupOutage: false,
      });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 1 });
  });

  it("returns 200 with dispatched: 0 on empty events list", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [] });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0 });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 401 when receive throws InvalidSignatureError", async () => {
    mockReceive.mockRejectedValueOnce(new InvalidSignatureError("bad body"));
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

  it("returns 500 when dispatch throws (so Microsoft retries)", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "microsoft-outlook-calendar",
          eventType: "event_changed",
          eventId: "a",
          occurredAt: "t",
          accountId: "u",
          payload: {},
        },
      ],
    });
    mockDispatch.mockRejectedValueOnce(new Error("queue down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });

  it("GET ?validationToken=X returns X as text/plain (alternate handshake path some Microsoft tooling uses)", async () => {
    const r = new Request(
      "https://app.example.test/api/webhooks/microsoft-outlook-calendar?validationToken=hello",
      { method: "GET" },
    );
    const res = await GET(r);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(await res.text()).toBe("hello");
  });

  it("GET without validationToken returns service-info JSON", async () => {
    const r = new Request(
      "https://app.example.test/api/webhooks/microsoft-outlook-calendar",
      { method: "GET" },
    );
    const res = await GET(r);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { service: string };
    expect(body.service).toBe("microsoft-outlook-calendar webhook");
  });
});
