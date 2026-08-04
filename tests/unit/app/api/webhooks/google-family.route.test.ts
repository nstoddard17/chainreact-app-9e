/**
 * @jest-environment node
 *
 * TEST-REDUNDANCY-CONSOLIDATION-2B — merged from 4 sibling suites:
 *   google-calendar.route.test.ts
 *   google-docs.route.test.ts
 *   google-drive.route.test.ts
 *   google-sheets.route.test.ts
 *
 * Each former file's body is wrapped VERBATIM in its own describe, so its
 * fixtures, helpers and beforeEach isolation are unchanged. Module-scope mock
 * declarations are hoisted once (Jest requires them at module scope); every
 * distinct provider module keeps its own jest.mock.
 */

const mockReceiveCalendar = jest.fn();
const mockDispatch = jest.fn();
const mockReceiveDocs = jest.fn();
const mockReceiveDrive = jest.fn();
const mockReceiveSheets = jest.fn();

jest.mock("@/integrations/google-calendar/webhooks/receive", () => ({
  receiveCalendarWebhook: (...args: unknown[]) => mockReceiveCalendar(...args),
}));

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

jest.mock("@/integrations/_registry", () => ({}));

jest.mock("@/integrations/google-docs/webhooks/receive", () => ({
  receiveDocsWebhook: (...args: unknown[]) => mockReceiveDocs(...args),
}));

jest.mock("@/integrations/google-drive/webhooks/receive", () => ({
  receiveDriveWebhook: (...args: unknown[]) => mockReceiveDrive(...args),
}));

jest.mock("@/integrations/google-sheets/webhooks/receive", () => ({
  receiveSheetsWebhook: (...args: unknown[]) => mockReceiveSheets(...args),
}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { POST as POST_calendar } from "@/app/api/webhooks/google-calendar/route";
import { POST as POST_docs } from "@/app/api/webhooks/google-docs/route";
import { POST as POST_drive } from "@/app/api/webhooks/google-drive/route";
import { POST as POST_sheets } from "@/app/api/webhooks/google-sheets/route";

// ---------------------------------------------------------------------------
// Merged verbatim from the former google-calendar.route.test.ts
// ---------------------------------------------------------------------------
describe("google-calendar.route", () => {

  beforeEach(() => {
    mockReceiveCalendar.mockReset();
    mockDispatch.mockReset();
  });

  function reqCalendar() {
    return new Request("https://app.example.test/api/webhooks/google-calendar", {
      method: "POST_calendar",
    });
  }

  describe("/api/webhooks/google-calendar route", () => {
    it("returns 200 ok on handshake", async () => {
      mockReceiveCalendar.mockResolvedValueOnce({ kind: "handshake" });
      const res = await POST_calendar(reqCalendar());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("returns 200 ok on unknown_channel (no dispatch)", async () => {
      mockReceiveCalendar.mockResolvedValueOnce({ kind: "unknown_channel" });
      const res = await POST_calendar(reqCalendar());
      expect(res.status).toBe(200);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("dispatches each event and returns the dispatched count on events", async () => {
      mockReceiveCalendar.mockResolvedValueOnce({
        kind: "events",
        events: [
          { provider: "google-calendar", eventType: "event_changed", eventId: "a", occurredAt: "t", providerAccountId: "u", payload: {} },
          { provider: "google-calendar", eventType: "event_changed", eventId: "b", occurredAt: "t", providerAccountId: "u", payload: {} },
        ],
      });
      mockDispatch
        .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false })
        .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false });

      const res = await POST_calendar(reqCalendar());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 2 });
      expect(mockDispatch).toHaveBeenCalledTimes(2);
    });

    it("returns 401 when receive throws InvalidSignatureError", async () => {
      mockReceiveCalendar.mockRejectedValueOnce(new InvalidSignatureError("bad token"));
      const res = await POST_calendar(reqCalendar());
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "invalid signature" });
    });

    it("returns 500 when receive throws an unexpected error", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveCalendar.mockRejectedValueOnce(new Error("DB unreachable"));
      const res = await POST_calendar(reqCalendar());
      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });

    it("returns 500 when dispatch throws (so Google retries)", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveCalendar.mockResolvedValueOnce({
        kind: "events",
        events: [
          { provider: "google-calendar", eventType: "event_changed", eventId: "a", occurredAt: "t", providerAccountId: "u", payload: {} },
        ],
      });
      mockDispatch.mockRejectedValueOnce(new Error("queue down"));
      const res = await POST_calendar(reqCalendar());
      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former google-docs.route.test.ts
// ---------------------------------------------------------------------------
describe("google-docs.route", () => {

  beforeEach(() => {
    mockReceiveDocs.mockReset();
    mockDispatch.mockReset();
  });

  function reqDocs() {
    return new Request("https://app.example.test/api/webhooks/google-docs", {
      method: "POST_docs",
    });
  }

  describe("/api/webhooks/google-docs route", () => {
    it("returns 200 ok on handshake (no dispatch)", async () => {
      mockReceiveDocs.mockResolvedValueOnce({ kind: "handshake" });
      const res = await POST_docs(reqDocs());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("returns 200 ok on unknown_channel (silent ack during channel-stop window)", async () => {
      mockReceiveDocs.mockResolvedValueOnce({ kind: "unknown_channel" });
      const res = await POST_docs(reqDocs());
      expect(res.status).toBe(200);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("dispatches each event and returns dispatched count on events", async () => {
      mockReceiveDocs.mockResolvedValueOnce({
        kind: "events",
        events: [
          {
            provider: "google-docs",
            eventType: "new_document",
            eventId: "doc-1:2026-05-08T10:00:00Z",
            occurredAt: "2026-05-08T10:00:00Z",
            providerAccountId: "alice@example.com",
            payload: {},
          },
          {
            provider: "google-docs",
            eventType: "document_updated",
            eventId: "doc-2:2026-05-08T11:00:00Z",
            occurredAt: "2026-05-08T11:00:00Z",
            providerAccountId: "alice@example.com",
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

      const res = await POST_docs(reqDocs());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 2 });
      expect(mockDispatch).toHaveBeenCalledTimes(2);
    });

    it("returns 401 when receive throws InvalidSignatureError", async () => {
      mockReceiveDocs.mockRejectedValueOnce(new InvalidSignatureError("bad token"));
      const res = await POST_docs(reqDocs());
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "invalid signature" });
    });

    it("returns 500 when receive throws an unexpected error (Google retries)", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveDocs.mockRejectedValueOnce(new Error("DB unreachable"));
      const res = await POST_docs(reqDocs());
      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });

    it("returns 500 when dispatch throws so Google retries", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveDocs.mockResolvedValueOnce({
        kind: "events",
        events: [
          {
            provider: "google-docs",
            eventType: "new_document",
            eventId: "doc-x:t",
            occurredAt: "t",
            providerAccountId: "u",
            payload: {},
          },
        ],
      });
      mockDispatch.mockRejectedValueOnce(new Error("queue down"));
      const res = await POST_docs(reqDocs());
      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former google-drive.route.test.ts
// ---------------------------------------------------------------------------
describe("google-drive.route", () => {

  beforeEach(() => {
    mockReceiveDrive.mockReset();
    mockDispatch.mockReset();
  });

  function reqDrive() {
    return new Request("https://app.example.test/api/webhooks/google-drive", {
      method: "POST_drive",
    });
  }

  function driveEvent(eventId: string) {
    return {
      provider: "google-drive",
      eventType: "file_changed",
      eventId,
      occurredAt: "t",
      providerAccountId: "u",
      payload: {},
    };
  }

  describe("/api/webhooks/google-drive route", () => {
    it("returns 200 ok on the sync handshake (no dispatch)", async () => {
      mockReceiveDrive.mockResolvedValueOnce({ kind: "handshake" });
      const res = await POST_drive(reqDrive());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("returns 200 ok on unknown_channel (no dispatch — avoids retry storms)", async () => {
      mockReceiveDrive.mockResolvedValueOnce({ kind: "unknown_channel" });
      const res = await POST_drive(reqDrive());
      expect(res.status).toBe(200);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("dispatches each event and returns the dispatched count", async () => {
      mockReceiveDrive.mockResolvedValueOnce({
        kind: "events",
        events: [driveEvent("a"), driveEvent("b")],
      });
      mockDispatch
        .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false })
        .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false });

      const res = await POST_drive(reqDrive());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 2 });
      expect(mockDispatch).toHaveBeenCalledTimes(2);
    });

    it("counts only enqueued runs (a duplicate event contributes 0)", async () => {
      mockReceiveDrive.mockResolvedValueOnce({
        kind: "events",
        events: [driveEvent("a"), driveEvent("a")],
      });
      mockDispatch
        .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false })
        .mockResolvedValueOnce({ matched: 0, enqueued: 0, duplicate: true, dedupOutage: false });

      const res = await POST_drive(reqDrive());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 1 });
    });

    it("returns 401 when receive throws InvalidSignatureError (channel-token spoof)", async () => {
      mockReceiveDrive.mockRejectedValueOnce(new InvalidSignatureError("Channel token mismatch"));
      const res = await POST_drive(reqDrive());
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "invalid signature" });
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("returns 500 when receive throws an unexpected error (so Google retries)", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveDrive.mockRejectedValueOnce(new Error("DB unreachable"));
      const res = await POST_drive(reqDrive());
      expect(res.status).toBe(500);
      expect(mockDispatch).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it("returns 500 when dispatch throws (so Google retries)", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveDrive.mockResolvedValueOnce({ kind: "events", events: [driveEvent("a")] });
      mockDispatch.mockRejectedValueOnce(new Error("queue down"));
      const res = await POST_drive(reqDrive());
      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });

    it("no-leak: a raw receive error (token / account / email / scope) never reaches the response body", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveDrive.mockRejectedValueOnce(
        new Error(
          "channelId=chn-secret token=ya29.LEAK account=acct-9 email=svc@acme.com scope=drive.readonly",
        ),
      );
      const res = await POST_drive(reqDrive());
      expect(res.status).toBe(500);
      const serialized = JSON.stringify(await res.json());
      for (const leak of ["chn-secret", "ya29.LEAK", "acct-9", "svc@acme.com", "drive.readonly"]) {
        expect(serialized).not.toContain(leak);
      }
      errSpy.mockRestore();
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former google-sheets.route.test.ts
// ---------------------------------------------------------------------------
describe("google-sheets.route", () => {

  beforeEach(() => {
    mockReceiveSheets.mockReset();
    mockDispatch.mockReset();
  });

  function reqSheets() {
    return new Request("https://app.example.test/api/webhooks/google-sheets", {
      method: "POST_sheets",
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
      mockReceiveSheets.mockResolvedValueOnce({ kind: "handshake" });
      const res = await POST_sheets(reqSheets());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("returns 200 ok on unknown_channel (no dispatch — avoids retry storms)", async () => {
      mockReceiveSheets.mockResolvedValueOnce({ kind: "unknown_channel" });
      const res = await POST_sheets(reqSheets());
      expect(res.status).toBe(200);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("dispatches each event and returns the dispatched count", async () => {
      mockReceiveSheets.mockResolvedValueOnce({
        kind: "events",
        events: [sheetsEvent("a"), sheetsEvent("b")],
      });
      mockDispatch
        .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false })
        .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false });

      const res = await POST_sheets(reqSheets());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 2 });
      expect(mockDispatch).toHaveBeenCalledTimes(2);
    });

    it("counts only enqueued runs (a duplicate event contributes 0)", async () => {
      mockReceiveSheets.mockResolvedValueOnce({
        kind: "events",
        events: [sheetsEvent("a"), sheetsEvent("a")],
      });
      mockDispatch
        .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false })
        .mockResolvedValueOnce({ matched: 0, enqueued: 0, duplicate: true, dedupOutage: false });

      const res = await POST_sheets(reqSheets());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 1 });
    });

    it("returns 401 when receive throws InvalidSignatureError (channel-token spoof)", async () => {
      mockReceiveSheets.mockRejectedValueOnce(new InvalidSignatureError("Channel token mismatch"));
      const res = await POST_sheets(reqSheets());
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "invalid signature" });
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("returns 500 when receive throws an unexpected error (so Google retries)", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveSheets.mockRejectedValueOnce(new Error("DB unreachable"));
      const res = await POST_sheets(reqSheets());
      expect(res.status).toBe(500);
      expect(mockDispatch).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it("returns 500 when dispatch throws (so Google retries)", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveSheets.mockResolvedValueOnce({ kind: "events", events: [sheetsEvent("a")] });
      mockDispatch.mockRejectedValueOnce(new Error("queue down"));
      const res = await POST_sheets(reqSheets());
      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });

    it("no-leak: a raw receive error (token / account / email / scope) never reaches the response body", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveSheets.mockRejectedValueOnce(
        new Error(
          "channelId=chn-secret token=ya29.LEAK account=acct-9 email=svc@acme.com scope=spreadsheets.readonly",
        ),
      );
      const res = await POST_sheets(reqSheets());
      expect(res.status).toBe(500);
      const serialized = JSON.stringify(await res.json());
      for (const leak of ["chn-secret", "ya29.LEAK", "acct-9", "svc@acme.com", "spreadsheets.readonly"]) {
        expect(serialized).not.toContain(leak);
      }
      errSpy.mockRestore();
    });
  });

});
