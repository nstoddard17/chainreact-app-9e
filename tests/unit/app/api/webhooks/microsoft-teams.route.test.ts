/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/microsoft-teams. Mocks receive +
 * dispatch so we exercise the route's own status-code mapping and
 * validation echo in isolation.
 */
const mockReceive = jest.fn();
const mockDispatch = jest.fn();

jest.mock("@/integrations/microsoft-teams/webhooks/receive", () => ({
  receiveTeamsWebhook: (...args: unknown[]) => mockReceive(...args),
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
} from "@/app/api/webhooks/microsoft-teams/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockDispatch.mockReset();
});

function req(opts: { url?: string } = {}): Request {
  return new Request(
    opts.url ?? "https://app.example.test/api/webhooks/microsoft-teams",
    { method: "POST" },
  );
}

describe("/api/webhooks/microsoft-teams route", () => {
  it("returns the validation token verbatim as text/plain on validation handshake", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "validation",
      token: "ms-graph-teams-token",
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(await res.text()).toBe("ms-graph-teams-token");
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("dispatches each event and returns the dispatched count on notifications", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "microsoft-teams",
          eventType: "new_channel_message",
          eventId: "sub-1:msg-A:created",
          occurredAt: "t",
          accountId: "u",
          payload: {},
        },
        {
          provider: "microsoft-teams",
          eventType: "new_channel_message",
          eventId: "sub-1:msg-B:created",
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

  it("returns 200 with dispatched: 0 when receive yielded zero events (clientState mismatch / unknown sub)", async () => {
    // V2 contract: spoofed clientState + unknown subscription don't
    // raise to the route — they yield empty events. Route must still
    // return 200 (no probing exposure).
    mockReceive.mockResolvedValueOnce({ kind: "events", events: [] });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dispatched: 0 });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns 401 on InvalidSignatureError (malformed body)", async () => {
    mockReceive.mockRejectedValueOnce(
      new InvalidSignatureError("bad json"),
    );
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid signature" });
  });

  it("returns 500 on generic receive errors so Microsoft retries", async () => {
    mockReceive.mockRejectedValueOnce(new Error("Graph 500"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Webhook receive failed." });
  });

  it("returns 500 when dispatch fails (Microsoft retries)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      events: [
        {
          provider: "microsoft-teams",
          eventType: "new_channel_message",
          eventId: "sub-1:msg-X:created",
          occurredAt: "t",
          accountId: "u",
          payload: {},
        },
      ],
    });
    mockDispatch.mockRejectedValueOnce(new Error("engine wedged"));

    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Dispatch failed." });
  });
});

describe("/api/webhooks/microsoft-teams GET", () => {
  it("echoes ?validationToken= as text/plain (probe support)", async () => {
    const res = await GET(
      new Request(
        "https://app.example.test/api/webhooks/microsoft-teams?validationToken=probe",
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(await res.text()).toBe("probe");
  });

  it("returns service-info JSON when no validation token is present", async () => {
    const res = await GET(
      new Request("https://app.example.test/api/webhooks/microsoft-teams"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { service: string };
    expect(json.service).toBe("microsoft-teams webhook");
  });
});
