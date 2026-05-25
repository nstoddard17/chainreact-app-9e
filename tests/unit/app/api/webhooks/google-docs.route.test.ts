/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-5 — route-level tests for /api/webhooks/google-docs.
 * Mocks receive + dispatch so the route's status-code mapping is
 * exercised in isolation (header verification + dispatch logic
 * themselves have unit tests at receive.test.ts).
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/google-docs/webhooks/receive", () => ({
  receiveDocsWebhook: (...args: unknown[]) => mockReceive(...args),
}));

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Bypass the side-effect integrations registry so module load doesn't
// reach for OAuth env vars etc.
jest.mock("@/integrations/_registry", () => ({}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { POST } from "@/app/api/webhooks/google-docs/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req() {
  return new Request("https://app.example.test/api/webhooks/google-docs", {
    method: "POST",
  });
}

describe("/api/webhooks/google-docs route", () => {
  it("returns 200 ok on handshake (no dispatch)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "handshake" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 200 ok on unknown_channel (silent ack during channel-stop window)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "unknown_channel" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("dispatches each event and returns dispatched count on events", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "google-docs",
          eventType: "new_document",
          eventId: "doc-1:2026-05-08T10:00:00Z",
          occurredAt: "2026-05-08T10:00:00Z",
          accountId: "alice@example.com",
          payload: {},
        },
        {
          provider: "google-docs",
          eventType: "document_updated",
          eventId: "doc-2:2026-05-08T11:00:00Z",
          occurredAt: "2026-05-08T11:00:00Z",
          accountId: "alice@example.com",
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

  it("returns 401 when receive throws InvalidSignatureError", async () => {
    mockReceive.mockRejectedValueOnce(new InvalidSignatureError("bad token"));
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid signature" });
  });

  it("returns 500 when receive throws an unexpected error (Google retries)", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockReceive.mockRejectedValueOnce(new Error("DB unreachable"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });

  it("returns 500 when dispatch throws so Google retries", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "google-docs",
          eventType: "new_document",
          eventId: "doc-x:t",
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
});
