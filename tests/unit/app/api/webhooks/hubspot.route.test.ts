/**
 * @jest-environment node
 *
 * Route-level tests for /api/webhooks/hubspot. Mocks the receive helper +
 * dedup + workflow-state lookup + enqueue so we exercise the route's
 * status-code mapping + per-event dispatch loop in isolation. Receive
 * helper + signature verifier have their own dedicated test files.
 */
const mockReceive = jest.fn();
const mockMarkSeen = jest.fn();
const mockGetState = jest.fn();
const mockEnqueue = jest.fn();
const mockIsAccountFrozen = jest.fn();

jest.mock("@/integrations/hubspot/triggers/webhookReceived/receive", () => ({
  receiveHubSpotWebhook: (...args: unknown[]) => mockReceive(...args),
}));

jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

// V2-READY-36 — the route now reads (state, accountId) via getDispatchInfo for
// the freeze gate. Wrap the legacy `mockGetState` jest.fn so existing tests that
// set a plain state string keep working, returning the getDispatchInfo shape.
jest.mock("@/repositories/workflows", () => ({
  getDispatchInfo: async (...args: unknown[]) => {
    const state = await mockGetState(...args);
    if (state === null || state === undefined) return null;
    if (typeof state === "object" && "state" in state) return state;
    return { state, accountId: "acct-test" };
  },
}));

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...args: unknown[]) => mockEnqueue(...args),
}));

jest.mock("@/services/accounts/accountFreeze", () => ({
  isAccountFrozen: (...args: unknown[]) => mockIsAccountFrozen(...args),
}));

// Bypass the side-effect import so registry side effects don't run
// (the registration tests cover that path directly).
jest.mock("@/integrations/_registry", () => ({}));

import {
  InvalidSignatureError,
  SignatureExpiredError,
} from "@/core/triggers/errors";
import { GET, POST } from "@/app/api/webhooks/hubspot/route";

beforeEach(() => {
  mockReceive.mockReset();
  mockMarkSeen.mockReset();
  mockGetState.mockReset();
  mockEnqueue.mockReset();
  // Default: account operational (not frozen) so existing tests are unchanged.
  mockIsAccountFrozen.mockReset();
  mockIsAccountFrozen.mockResolvedValue(false);
});

function req(): Request {
  return new Request("https://app.example.test/api/webhooks/hubspot", {
    method: "POST",
    body: "[]",
  });
}

function makeEvent(eventId: string = "evt-1") {
  return {
    provider: "hubspot",
    eventType: "webhook_received",
    eventId,
    occurredAt: "2026-05-10T00:00:00Z",
    providerAccountId: "9988776",
    payload: {
      subscriptionType: "contact.creation",
      portalId: "9988776",
      hubId: "9988776",
      objectId: "5001",
      propertyName: null,
      propertyValue: null,
      occurredAt: 1700000000000,
      subscriptionId: "67890",
      appId: "11223344",
      attemptNumber: 0,
      changeSource: null,
      event: {},
    },
  };
}

describe("/api/webhooks/hubspot route", () => {
  it("returns 401 on InvalidSignatureError with 'invalid signature' body", async () => {
    mockReceive.mockRejectedValueOnce(
      new InvalidSignatureError("signature mismatch"),
    );
    const res = await POST(req());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("invalid signature");
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("returns 401 on SignatureExpiredError with 'signature expired' body", async () => {
    mockReceive.mockRejectedValueOnce(
      new SignatureExpiredError("timestamp outside tolerance"),
    );
    const res = await POST(req());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("signature expired");
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected receive error", async () => {
    mockReceive.mockRejectedValueOnce(new Error("network"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("returns 200 with dispatched: 0 and counts skipped for unknown_subscription deliveries", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      deliveries: [
        {
          event: makeEvent(),
          targets: [],
          skipReason: "unknown_subscription",
          subscriptionType: "contact.creation",
          portalId: "9988776",
        },
      ],
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      dispatched: 0,
      skipped: 1,
      duplicates: 0,
    });
    expect(mockMarkSeen).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("returns 200 with dispatched: 0 and counts skipped for no_matching_refs deliveries", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      deliveries: [
        {
          event: makeEvent(),
          targets: [],
          skipReason: "no_matching_refs",
          subscriptionType: "contact.creation",
          portalId: "9988776",
        },
      ],
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.skipped).toBe(1);
    expect(json.dispatched).toBe(0);
  });

  it("dedups + enqueues each target on a fresh event", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      deliveries: [
        {
          event: makeEvent("evt-A"),
          targets: [
            { workflowId: "wf-A", nodeId: "node-A", userId: "user-A" },
            { workflowId: "wf-B", nodeId: "node-B", userId: "user-B" },
          ],
          skipReason: null,
          subscriptionType: "contact.creation",
          portalId: "9988776",
        },
      ],
    });
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockGetState.mockResolvedValue("active");
    mockEnqueue.mockResolvedValue({ runId: "r", enqueuedAt: "t" });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      dispatched: 2,
      skipped: 0,
      duplicates: 0,
    });
    expect(mockMarkSeen).toHaveBeenCalledTimes(1);
    expect(mockMarkSeen).toHaveBeenCalledWith("hubspot", "evt-A");
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it("dedupes once per eventId regardless of N targets — duplicate event short-circuits all targets", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      deliveries: [
        {
          event: makeEvent("evt-DUPE"),
          targets: [
            { workflowId: "wf-A", nodeId: "node-A", userId: "user-A" },
            { workflowId: "wf-B", nodeId: "node-B", userId: "user-B" },
          ],
          skipReason: null,
          subscriptionType: "contact.creation",
          portalId: "9988776",
        },
      ],
    });
    mockMarkSeen.mockResolvedValueOnce({ fresh: false });

    const res = await POST(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      ok: true,
      dispatched: 0,
      skipped: 0,
      duplicates: 1,
    });
    // No state-gate / enqueue calls because dedup short-circuited.
    expect(mockGetState).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("drops inactive workflow targets but enqueues active ones (per-target state gate)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      deliveries: [
        {
          event: makeEvent(),
          targets: [
            { workflowId: "wf-paused", nodeId: "node-A", userId: "user-A" },
            { workflowId: "wf-active", nodeId: "node-B", userId: "user-B" },
          ],
          skipReason: null,
          subscriptionType: "contact.creation",
          portalId: "9988776",
        },
      ],
    });
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockGetState
      .mockResolvedValueOnce("paused")
      .mockResolvedValueOnce("active");
    mockEnqueue.mockResolvedValue({ runId: "r", enqueuedAt: "t" });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      dispatched: 1,
      skipped: 0,
      duplicates: 0,
    });
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.mock.calls[0]![0].workflowId).toBe("wf-active");
  });

  it("V2-READY-36 — drops frozen-account targets but enqueues non-frozen ones (200, no retry)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      deliveries: [
        {
          event: makeEvent("evt-frozen"),
          targets: [
            { workflowId: "wf-frozen", nodeId: "node-A", userId: "user-A" },
            { workflowId: "wf-ok", nodeId: "node-B", userId: "user-B" },
          ],
          skipReason: null,
          subscriptionType: "contact.creation",
          portalId: "9988776",
        },
      ],
    });
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockGetState.mockResolvedValue("active"); // both workflows active
    // getDispatchInfo wrapper returns accountId "acct-test" for both; resolve
    // the freeze per-call: first target frozen, second operational.
    mockIsAccountFrozen
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    mockEnqueue.mockResolvedValue({ runId: "r", enqueuedAt: "t" });

    const res = await POST(req());

    expect(res.status).toBe(200); // never 5xx → HubSpot does not retry
    expect(await res.json()).toEqual({
      ok: true,
      dispatched: 1,
      skipped: 0,
      duplicates: 0,
    });
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.mock.calls[0]![0].workflowId).toBe("wf-ok");
  });

  it("V2-READY-36 — frozen-account skip never logs the account id or raw payload", async () => {
    const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      deliveries: [
        {
          event: makeEvent("evt-frozen-2"),
          targets: [{ workflowId: "wf-frozen", nodeId: "node-A", userId: "user-A" }],
          skipReason: null,
          subscriptionType: "contact.creation",
          portalId: "9988776",
        },
      ],
    });
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockGetState.mockResolvedValue("active");
    mockIsAccountFrozen.mockResolvedValueOnce(true);

    await POST(req());

    const logged = debugSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("dropped_frozen_account");
    expect(logged).not.toContain("acct-test"); // account id never logged
    expect(logged).not.toContain("9988776"); // portal id / provider payload never logged
    expect(mockEnqueue).not.toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it("proceeds with dispatch when dedup throws (fail-open)", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      deliveries: [
        {
          event: makeEvent(),
          targets: [
            { workflowId: "wf-A", nodeId: "node-A", userId: "user-A" },
          ],
          skipReason: null,
          subscriptionType: "contact.creation",
          portalId: "9988776",
        },
      ],
    });
    mockMarkSeen.mockRejectedValueOnce(new Error("dedup table outage"));
    mockGetState.mockResolvedValue("active");
    mockEnqueue.mockResolvedValue({ runId: "r", enqueuedAt: "t" });

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ dispatched: 1 });
    warn.mockRestore();
  });

  it("returns 500 on enqueue error so HubSpot retries", async () => {
    mockReceive.mockResolvedValueOnce({
      kind: "events",
      deliveries: [
        {
          event: makeEvent(),
          targets: [
            { workflowId: "wf-A", nodeId: "node-A", userId: "user-A" },
          ],
          skipReason: null,
          subscriptionType: "contact.creation",
          portalId: "9988776",
        },
      ],
    });
    mockMarkSeen.mockResolvedValueOnce({ fresh: true });
    mockGetState.mockResolvedValueOnce("active");
    mockEnqueue.mockRejectedValueOnce(new Error("queue down"));

    const res = await POST(req());
    expect(res.status).toBe(500);
  });

  it("GET returns service info JSON", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.service).toBe("hubspot webhook");
    expect(json.description).toContain("X-HubSpot-Signature-V3");
  });
});
