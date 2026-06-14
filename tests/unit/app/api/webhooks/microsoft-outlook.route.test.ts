/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/microsoft-outlook (the MAIL route)
 * (V2-READY-13). Mocks receive + dispatch so we exercise the route's OWN
 * status-code mapping and the validation echo in isolation. The
 * structurally-identical microsoft-outlook-calendar / -onedrive / -teams routes
 * already have this coverage; the mail route only had a receive-handler test +
 * an e2e walkthrough, never a Jest route test for the 200 / 401 / 500 mapping.
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/microsoft-outlook/webhooks/receive", () => ({
  receiveOutlookWebhook: (...args: unknown[]) => mockReceive(...args),
}));

jest.mock("@/services/triggers/dispatch", () => ({
  dispatchTriggerEvent: (...args: unknown[]) => mockDispatch(...args),
}));

// Bypass the side-effect import so registry side effects don't run.
jest.mock("@/integrations/_registry", () => ({}));

import { InvalidSignatureError } from "@/core/triggers/errors";
import { GET, POST } from "@/app/api/webhooks/microsoft-outlook/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req(): Request {
  return new Request("https://app.example.test/api/webhooks/microsoft-outlook", {
    method: "POST",
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
      events: [mailEvent("a"), mailEvent("b")],
    });
    mockDispatch
      .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false })
      .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 2 });
    expect(mockDispatch).toHaveBeenCalledTimes(2);
  });

  it("excludes deduped events from the dispatched count (route reports dispatchTriggerEvent's enqueued total)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [mailEvent("a"), mailEvent("a")], // second is a duplicate
    });
    mockDispatch
      .mockResolvedValueOnce({ matched: 1, enqueued: 1, duplicate: false, dedupOutage: false })
      .mockResolvedValueOnce({ matched: 0, enqueued: 0, duplicate: true, dedupOutage: false });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 1 });
  });

  it("returns 200 with dispatched: 0 on an empty events list (clientState-mismatch / unknown-subscription quiet ack)", async () => {
    // The receive module verifies clientState per-notification and drops
    // mismatches / unknown subscriptions, so the route sees an empty events
    // array — a provider-safe quiet ack with nothing enqueued.
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [] });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0 });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 401 when receive throws InvalidSignatureError (corrupt body)", async () => {
    mockReceive.mockRejectedValueOnce(new InvalidSignatureError("bad body"));
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid signature" });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 500 when receive throws an unexpected error (so Microsoft retries)", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockReceive.mockRejectedValueOnce(new Error("DB unreachable"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(mockDispatch).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("returns 500 when dispatch throws (so Microsoft retries)", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [mailEvent("a")] });
    mockDispatch.mockRejectedValueOnce(new Error("queue down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });

  it("no-leak: a raw receive error (clientState / token / account / email / scope) never reaches the response body", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockReceive.mockRejectedValueOnce(
      new Error(
        "clientState=cs-secret token=eyJ0.LEAK account=acct-9 email=svc@acme.com scope=Mail.Read",
      ),
    );
    const res = await POST(req());
    expect(res.status).toBe(500);
    const serialized = JSON.stringify(await res.json());
    for (const leak of ["cs-secret", "eyJ0.LEAK", "acct-9", "svc@acme.com", "Mail.Read"]) {
      expect(serialized).not.toContain(leak);
    }
    errSpy.mockRestore();
  });

  it("GET ?validationToken=X returns X as text/plain (alternate handshake path some Microsoft tooling uses)", async () => {
    const r = new Request(
      "https://app.example.test/api/webhooks/microsoft-outlook?validationToken=hello",
      { method: "GET" },
    );
    const res = await GET(r);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(await res.text()).toBe("hello");
  });

  it("GET without validationToken returns service-info JSON (no dispatch, no leak)", async () => {
    const r = new Request("https://app.example.test/api/webhooks/microsoft-outlook", {
      method: "GET",
    });
    const res = await GET(r);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { service: string };
    expect(body.service).toBe("microsoft-outlook webhook");
  });
});
