/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/google-sheets (V2-READY-12). Mocks receive +
 * dispatch so we exercise the route's OWN status-code mapping in isolation. The
 * structurally-identical google-calendar / google-docs routes already have this
 * coverage; Sheets only had a receive-handler test + an e2e walkthrough, never a
 * Jest route test for the 200 / 401 / 500 mapping. (Sheets rides Drive's
 * file-watch transport — same X-Goog-* channel-token contract.)
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/google-sheets/webhooks/receive", () => ({
  receiveSheetsWebhook: (...args: unknown[]) => mockReceive(...args),
}));

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Bypass the side-effect import so registry side effects don't run.
jest.mock("@/integrations/_registry", () => ({}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { POST } from "@/app/api/webhooks/google-sheets/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req() {
  return new Request("https://app.example.test/api/webhooks/google-sheets", {
    method: "POST",
  });
}

function sheetsEvent(eventId: string) {
  return {
    provider: "google-sheets",
    eventType: "row_changed",
    eventId,
    occurredAt: "t",
    providerAccountId: "u",
    payload: {},
  };
}

describe("/api/webhooks/google-sheets route", () => {
  it("returns 200 ok on the sync handshake (no dispatch)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "handshake" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 200 ok on unknown_channel (no dispatch — avoids retry storms)", async () => {
    mockReceive.mockResolvedValueOnce({ kind: "unknown_channel" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("dispatches each event and returns the dispatched count", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [sheetsEvent("a"), sheetsEvent("b")],
    });
    mockDispatch
      .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false })
      .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 2 });
    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });

  it("counts only enqueued runs (a duplicate event contributes 0)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [sheetsEvent("a"), sheetsEvent("a")],
    });
    mockDispatch
      .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false })
      .mockResolvedValueOnce({ matched: 0, enqueued: 0, duplicate: true, dedupOutage: false });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 1 });
  });

  it("returns 401 when receive throws InvalidSignatureError (channel-token spoof)", async () => {
    mockReceive.mockRejectedValueOnce(new InvalidSignatureError("Channel token mismatch"));
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid signature" });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 500 when receive throws an unexpected error (so Google retries)", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockReceive.mockRejectedValueOnce(new Error("DB unreachable"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(mockDispatch).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("returns 500 when dispatch throws (so Google retries)", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [sheetsEvent("a")] });
    mockDispatch.mockRejectedValueOnce(new Error("queue down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });

  it("no-leak: a raw receive error (token / account / email / scope) never reaches the response body", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockReceive.mockRejectedValueOnce(
      new Error(
        "channelId=chn-secret token=ya29.LEAK account=acct-9 email=svc@acme.com scope=spreadsheets.readonly",
      ),
    );
    const res = await POST(req());
    expect(res.status).toBe(500);
    const serialized = JSON.stringify(await res.json());
    for (const leak of ["chn-secret", "ya29.LEAK", "acct-9", "svc@acme.com", "spreadsheets.readonly"]) {
      expect(serialized).not.toContain(leak);
    }
    errSpy.mockRestore();
  });
});
