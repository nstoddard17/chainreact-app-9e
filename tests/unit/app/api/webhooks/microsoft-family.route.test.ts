/**
 * @jest-environment node
 *
 * TEST-REDUNDANCY-CONSOLIDATION-2B — merged from 4 sibling suites:
 *   microsoft-onedrive.route.test.ts
 *   microsoft-outlook.route.test.ts
 *   microsoft-outlook-calendar.route.test.ts
 *   microsoft-teams.route.test.ts
 *
 * Each former file's body is wrapped VERBATIM in its own describe, so its
 * fixtures, helpers and beforeEach isolation are unchanged. Module-scope mock
 * declarations are hoisted once (Jest requires them at module scope); every
 * distinct provider module keeps its own jest.mock.
 */

const mockReceiveOneDrive = jest.fn();
const mockDispatch = jest.fn();
const mockReceiveOutlook = jest.fn();
const mockReceiveOutlookCal = jest.fn();
const mockReceiveTeams = jest.fn();

jest.mock("@/integrations/microsoft-onedrive/webhooks/receive", () => ({
  receiveOneDriveWebhook: (...args: unknown[]) => mockReceiveOneDrive(...args),
}));

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

jest.mock("@/integrations/_registry", () => ({}));

jest.mock("@/integrations/microsoft-outlook/webhooks/receive", () => ({
  receiveOutlookWebhook: (...args: unknown[]) => mockReceiveOutlook(...args),
}));

jest.mock("@/integrations/microsoft-outlook-calendar/webhooks/receive", () => ({
  receiveOutlookCalendarWebhook: (...args: unknown[]) => mockReceiveOutlookCal(...args),
}));

jest.mock("@/integrations/microsoft-teams/webhooks/receive", () => ({
  receiveTeamsWebhook: (...args: unknown[]) => mockReceiveTeams(...args),
}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { GET as GET_onedrive, POST as POST_onedrive } from "@/app/api/webhooks/microsoft-onedrive/route";
import { GET as GET_outlook, POST as POST_outlook } from "@/app/api/webhooks/microsoft-outlook/route";
import { GET as GET_outlookCal, POST as POST_outlookCal } from "@/app/api/webhooks/microsoft-outlook-calendar/route";
import { GET as GET_teams, POST as POST_teams } from "@/app/api/webhooks/microsoft-teams/route";

// ---------------------------------------------------------------------------
// Merged verbatim from the former microsoft-onedrive.route.test.ts
// ---------------------------------------------------------------------------
describe("microsoft-onedrive.route", () => {

  beforeEach(() => {
    mockReceiveOneDrive.mockReset();
    mockDispatch.mockReset();
  });

  function reqOneDrive(opts: { url?: string } = {}): Request {
    return new Request(
      opts.url ?? "https://app.example.test/api/webhooks/microsoft-onedrive",
      { method: "POST_onedrive" },
    );
  }

  describe("/api/webhooks/microsoft-onedrive route", () => {
    it("returns the validation token verbatim as text/plain on validation handshake", async () => {
      mockReceiveOneDrive.mockResolvedValueOnce({
        kind: "validation",
        token: "ms-graph-token-xyz",
      });
      const res = await POST_onedrive(reqOneDrive());
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      expect(await res.text()).toBe("ms-graph-token-xyz");
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("dispatches each event and returns the dispatched count on notifications", async () => {
      mockReceiveOneDrive.mockResolvedValueOnce({
        kind: "events",
        events: [
          {
            provider: "microsoft-onedrive",
            eventType: "file_changed",
            eventId: "a",
            occurredAt: "t",
            providerAccountId: "u",
            payload: {},
          },
          {
            provider: "microsoft-onedrive",
            eventType: "file_changed",
            eventId: "b",
            occurredAt: "t",
            providerAccountId: "u",
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

      const res = await POST_onedrive(reqOneDrive());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 2 });
      expect(mockDispatch).toHaveBeenCalledTimes(2);
    });

    it("excludes deduped events from the dispatched count (relies on dispatchTriggerEvent's enqueued total)", async () => {
      mockReceiveOneDrive.mockResolvedValueOnce({
        kind: "events",
        events: [
          {
            provider: "microsoft-onedrive",
            eventType: "file_changed",
            eventId: "a",
            occurredAt: "t",
            providerAccountId: "u",
            payload: {},
          },
          {
            provider: "microsoft-onedrive",
            eventType: "file_changed",
            eventId: "a", // duplicate
            occurredAt: "t",
            providerAccountId: "u",
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

      const res = await POST_onedrive(reqOneDrive());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 1 });
    });

    it("returns 200 with dispatched: 0 on empty events list", async () => {
      mockReceiveOneDrive.mockResolvedValueOnce({ kind: "events", events: [] });
      const res = await POST_onedrive(reqOneDrive());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 0 });
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("returns 401 when receive throws InvalidSignatureError", async () => {
      mockReceiveOneDrive.mockRejectedValueOnce(new InvalidSignatureError("bad body"));
      const res = await POST_onedrive(reqOneDrive());
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "invalid signature" });
    });

    it("returns 500 when receive throws an unexpected error", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveOneDrive.mockRejectedValueOnce(new Error("DB unreachable"));
      const res = await POST_onedrive(reqOneDrive());
      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });

    it("returns 500 when dispatch throws (so Microsoft retries)", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveOneDrive.mockResolvedValueOnce({
        kind: "events",
        events: [
          {
            provider: "microsoft-onedrive",
            eventType: "file_changed",
            eventId: "a",
            occurredAt: "t",
            providerAccountId: "u",
            payload: {},
          },
        ],
      });
      mockDispatch.mockRejectedValueOnce(new Error("queue down"));
      const res = await POST_onedrive(reqOneDrive());
      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });

    it("GET_onedrive ?validationToken=X returns X as text/plain (alternate handshake path)", async () => {
      const r = new Request(
        "https://app.example.test/api/webhooks/microsoft-onedrive?validationToken=hello",
        { method: "GET_onedrive" },
      );
      const res = await GET_onedrive(r);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      expect(await res.text()).toBe("hello");
    });

    it("GET_onedrive without validationToken returns service-info JSON", async () => {
      const r = new Request(
        "https://app.example.test/api/webhooks/microsoft-onedrive",
        { method: "GET_onedrive" },
      );
      const res = await GET_onedrive(r);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { service: string };
      expect(body.service).toBe("microsoft-onedrive webhook");
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former microsoft-outlook.route.test.ts
// ---------------------------------------------------------------------------
describe("microsoft-outlook.route", () => {

  beforeEach(() => {
    mockReceiveOutlook.mockReset();
    mockDispatch.mockReset();
  });

  function reqOutlook(): Request {
    return new Request("https://app.example.test/api/webhooks/microsoft-outlook", {
      method: "POST_outlook",
    });
  }

  function mailEvent(eventId: string) {
    return {
      provider: "microsoft-outlook",
      eventType: "message_received",
      eventId,
      occurredAt: "t",
      providerAccountId: "u",
      payload: {},
    };
  }

  describe("/api/webhooks/microsoft-outlook route", () => {
    it("returns the validation token verbatim as text/plain on the validation handshake (no DB I/O, no dispatch)", async () => {
      mockReceiveOutlook.mockResolvedValueOnce({
        kind: "validation",
        token: "ms-graph-token-xyz",
      });
      const res = await POST_outlook(reqOutlook());
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      expect(await res.text()).toBe("ms-graph-token-xyz");
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("dispatches each event and returns the dispatched count on notifications", async () => {
      mockReceiveOutlook.mockResolvedValueOnce({
        kind: "events",
        events: [mailEvent("a"), mailEvent("b")],
      });
      mockDispatch
        .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false })
        .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false });

      const res = await POST_outlook(reqOutlook());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 2 });
      expect(mockDispatch).toHaveBeenCalledTimes(2);
    });

    it("excludes deduped events from the dispatched count (route reports dispatchTriggerEvent's enqueued total)", async () => {
      mockReceiveOutlook.mockResolvedValueOnce({
        kind: "events",
        events: [mailEvent("a"), mailEvent("a")], // second is a duplicate
      });
      mockDispatch
        .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false })
        .mockResolvedValueOnce({ matched: 0, enqueued: 0, duplicate: true, dedupOutage: false });

      const res = await POST_outlook(reqOutlook());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 1 });
    });

    it("returns 200 with dispatched: 0 on an empty events list (clientState-mismatch / unknown-subscription quiet ack)", async () => {
      // The receive module verifies clientState per-notification and drops
      // mismatches / unknown subscriptions, so the route sees an empty events
      // array — a provider-safe quiet ack with nothing enqueued.
      mockReceiveOutlook.mockResolvedValueOnce({ kind: "events", events: [] });
      const res = await POST_outlook(reqOutlook());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 0 });
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("returns 401 when receive throws InvalidSignatureError (corrupt body)", async () => {
      mockReceiveOutlook.mockRejectedValueOnce(new InvalidSignatureError("bad body"));
      const res = await POST_outlook(reqOutlook());
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "invalid signature" });
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("returns 500 when receive throws an unexpected error (so Microsoft retries)", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveOutlook.mockRejectedValueOnce(new Error("DB unreachable"));
      const res = await POST_outlook(reqOutlook());
      expect(res.status).toBe(500);
      expect(mockDispatch).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it("returns 500 when dispatch throws (so Microsoft retries)", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveOutlook.mockResolvedValueOnce({ kind: "events", events: [mailEvent("a")] });
      mockDispatch.mockRejectedValueOnce(new Error("queue down"));
      const res = await POST_outlook(reqOutlook());
      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });

    it("no-leak: a raw receive error (clientState / token / account / email / scope) never reaches the response body", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveOutlook.mockRejectedValueOnce(
        new Error(
          "clientState=cs-secret token=eyJ0.LEAK account=acct-9 email=svc@acme.com scope=Mail.Read",
        ),
      );
      const res = await POST_outlook(reqOutlook());
      expect(res.status).toBe(500);
      const serialized = JSON.stringify(await res.json());
      for (const leak of ["cs-secret", "eyJ0.LEAK", "acct-9", "svc@acme.com", "Mail.Read"]) {
        expect(serialized).not.toContain(leak);
      }
      errSpy.mockRestore();
    });

    it("GET_outlook ?validationToken=X returns X as text/plain (alternate handshake path some Microsoft tooling uses)", async () => {
      const r = new Request(
        "https://app.example.test/api/webhooks/microsoft-outlook?validationToken=hello",
        { method: "GET_outlook" },
      );
      const res = await GET_outlook(r);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      expect(await res.text()).toBe("hello");
    });

    it("GET_outlook without validationToken returns service-info JSON (no dispatch, no leak)", async () => {
      const r = new Request("https://app.example.test/api/webhooks/microsoft-outlook", {
        method: "GET_outlook",
      });
      const res = await GET_outlook(r);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { service: string };
      expect(body.service).toBe("microsoft-outlook webhook");
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former microsoft-outlook-calendar.route.test.ts
// ---------------------------------------------------------------------------
describe("microsoft-outlook-calendar.route", () => {

  beforeEach(() => {
    mockReceiveOutlookCal.mockReset();
    mockDispatch.mockReset();
  });

  function reqOutlookCal(opts: { url?: string } = {}): Request {
    return new Request(
      opts.url ?? "https://app.example.test/api/webhooks/microsoft-outlook-calendar",
      { method: "POST_outlookCal" },
    );
  }

  describe("/api/webhooks/microsoft-outlook-calendar route", () => {
    it("returns the validation token verbatim as text/plain on validation handshake", async () => {
      mockReceiveOutlookCal.mockResolvedValueOnce({
        kind: "validation",
        token: "ms-graph-token-xyz",
      });
      const res = await POST_outlookCal(reqOutlookCal());
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      expect(await res.text()).toBe("ms-graph-token-xyz");
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("dispatches each event and returns the dispatched count on notifications", async () => {
      mockReceiveOutlookCal.mockResolvedValueOnce({
        kind: "events",
        events: [
          {
            provider: "microsoft-outlook-calendar",
            eventType: "event_changed",
            eventId: "a",
            occurredAt: "t",
            providerAccountId: "u",
            payload: {},
          },
          {
            provider: "microsoft-outlook-calendar",
            eventType: "event_changed",
            eventId: "b",
            occurredAt: "t",
            providerAccountId: "u",
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

      const res = await POST_outlookCal(reqOutlookCal());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 2 });
      expect(mockDispatch).toHaveBeenCalledTimes(2);
    });

    it("excludes deduped events from the dispatched count (relies on dispatchTriggerEvent's enqueued total)", async () => {
      // Dedup happens inside dispatchTriggerEvent, which returns enqueued=0
      // for duplicates. The route reports the sum of enqueued counters —
      // dedup behavior is observable as "ok: true, dispatched: < eventCount".
      mockReceiveOutlookCal.mockResolvedValueOnce({
        kind: "events",
        events: [
          {
            provider: "microsoft-outlook-calendar",
            eventType: "event_changed",
            eventId: "a",
            occurredAt: "t",
            providerAccountId: "u",
            payload: {},
          },
          {
            provider: "microsoft-outlook-calendar",
            eventType: "event_changed",
            eventId: "a", // duplicate
            occurredAt: "t",
            providerAccountId: "u",
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

      const res = await POST_outlookCal(reqOutlookCal());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 1 });
    });

    it("returns 200 with dispatched: 0 on empty events list", async () => {
      mockReceiveOutlookCal.mockResolvedValueOnce({ kind: "events", events: [] });
      const res = await POST_outlookCal(reqOutlookCal());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 0 });
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("returns 401 when receive throws InvalidSignatureError", async () => {
      mockReceiveOutlookCal.mockRejectedValueOnce(new InvalidSignatureError("bad body"));
      const res = await POST_outlookCal(reqOutlookCal());
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "invalid signature" });
    });

    it("returns 500 when receive throws an unexpected error", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveOutlookCal.mockRejectedValueOnce(new Error("DB unreachable"));
      const res = await POST_outlookCal(reqOutlookCal());
      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });

    it("returns 500 when dispatch throws (so Microsoft retries)", async () => {
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      mockReceiveOutlookCal.mockResolvedValueOnce({
        kind: "events",
        events: [
          {
            provider: "microsoft-outlook-calendar",
            eventType: "event_changed",
            eventId: "a",
            occurredAt: "t",
            providerAccountId: "u",
            payload: {},
          },
        ],
      });
      mockDispatch.mockRejectedValueOnce(new Error("queue down"));
      const res = await POST_outlookCal(reqOutlookCal());
      expect(res.status).toBe(500);
      errSpy.mockRestore();
    });

    it("GET_outlookCal ?validationToken=X returns X as text/plain (alternate handshake path some Microsoft tooling uses)", async () => {
      const r = new Request(
        "https://app.example.test/api/webhooks/microsoft-outlook-calendar?validationToken=hello",
        { method: "GET_outlookCal" },
      );
      const res = await GET_outlookCal(r);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      expect(await res.text()).toBe("hello");
    });

    it("GET_outlookCal without validationToken returns service-info JSON", async () => {
      const r = new Request(
        "https://app.example.test/api/webhooks/microsoft-outlook-calendar",
        { method: "GET_outlookCal" },
      );
      const res = await GET_outlookCal(r);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { service: string };
      expect(body.service).toBe("microsoft-outlook-calendar webhook");
    });
  });

});

// ---------------------------------------------------------------------------
// Merged verbatim from the former microsoft-teams.route.test.ts
// ---------------------------------------------------------------------------
describe("microsoft-teams.route", () => {

  beforeEach(() => {
    mockReceiveTeams.mockReset();
    mockDispatch.mockReset();
  });

  function reqTeams(opts: { url?: string } = {}): Request {
    return new Request(
      opts.url ?? "https://app.example.test/api/webhooks/microsoft-teams",
      { method: "POST_teams" },
    );
  }

  describe("/api/webhooks/microsoft-teams route", () => {
    it("returns the validation token verbatim as text/plain on validation handshake", async () => {
      mockReceiveTeams.mockResolvedValueOnce({
        kind: "validation",
        token: "ms-graph-teams-token",
      });
      const res = await POST_teams(reqTeams());
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      expect(await res.text()).toBe("ms-graph-teams-token");
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("dispatches each event and returns the dispatched count on notifications", async () => {
      mockReceiveTeams.mockResolvedValueOnce({
        kind: "events",
        events: [
          {
            provider: "microsoft-teams",
            eventType: "new_channel_message",
            eventId: "sub-1:msg-A:created",
            occurredAt: "t",
            providerAccountId: "u",
            payload: {},
          },
          {
            provider: "microsoft-teams",
            eventType: "new_channel_message",
            eventId: "sub-1:msg-B:created",
            occurredAt: "t",
            providerAccountId: "u",
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

      const res = await POST_teams(reqTeams());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 2 });
      expect(mockDispatch).toHaveBeenCalledTimes(2);
    });

    it("returns 200 with dispatched: 0 when receive yielded zero events (clientState mismatch / unknown sub)", async () => {
      // V2 contract: spoofed clientState + unknown subscription don't
      // raise to the route — they yield empty events. Route must still
      // return 200 (no probing exposure).
      mockReceiveTeams.mockResolvedValueOnce({ kind: "events", events: [] });

      const res = await POST_teams(reqTeams());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dispatched: 0 });
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("returns 401 on InvalidSignatureError (malformed body)", async () => {
      mockReceiveTeams.mockRejectedValueOnce(
        new InvalidSignatureError("bad json"),
      );
      const res = await POST_teams(reqTeams());
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "invalid signature" });
    });

    it("returns 500 on generic receive errors so Microsoft retries", async () => {
      mockReceiveTeams.mockRejectedValueOnce(new Error("Graph 500"));
      const res = await POST_teams(reqTeams());
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Webhook receive failed." });
    });

    it("returns 500 when dispatch fails (Microsoft retries)", async () => {
      mockReceiveTeams.mockResolvedValueOnce({
        kind: "events",
        events: [
          {
            provider: "microsoft-teams",
            eventType: "new_channel_message",
            eventId: "sub-1:msg-X:created",
            occurredAt: "t",
            providerAccountId: "u",
            payload: {},
          },
        ],
      });
      mockDispatch.mockRejectedValueOnce(new Error("engine wedged"));

      const res = await POST_teams(reqTeams());
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Dispatch failed." });
    });
  });

  describe("/api/webhooks/microsoft-teams GET_teams", () => {
    it("echoes ?validationToken= as text/plain (probe support)", async () => {
      const res = await GET_teams(
        new Request(
          "https://app.example.test/api/webhooks/microsoft-teams?validationToken=probe",
        ),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      expect(await res.text()).toBe("probe");
    });

    it("returns service-info JSON when no validation token is present", async () => {
      const res = await GET_teams(
        new Request("https://app.example.test/api/webhooks/microsoft-teams"),
      );
      expect(res.status).toBe(200);
      const json = (await res.json()) as { service: string };
      expect(json.service).toBe("microsoft-teams webhook");
    });
  });

});
