/**
 * @jest-environment node
 *
 * Tests for `receiveHubSpotWebhook` — the verify-and-parse helper that
 * the route delegates to. Mocks the app-subscriptions + refs repos so
 * we exercise:
 *   - V3 signature verification (delegates to verifyHubSpotSignature).
 *   - Empty body / bad JSON / non-array body rejection.
 *   - Unknown-subscription routing (no app_sub row for eventType).
 *   - No-matching-refs routing (refs absent for this portal).
 *   - Multi-event payload — each event independently routed.
 *   - propertyChange propertyName scoping in the lookup.
 */
import { createHmac } from "node:crypto";

const mockAppSubsFind = jest.fn();
const mockRefsList = jest.fn();

jest.mock("@/repositories/hubspotAppSubscriptions", () => ({
  find: (...args: unknown[]) => mockAppSubsFind(...args),
}));

jest.mock("@/repositories/hubspotSubscriptionRefs", () => ({
  listForDispatch: (...args: unknown[]) => mockRefsList(...args),
}));

import {
  InvalidSignatureError,
  SignatureExpiredError,
} from "@/core/triggers/errors";
import { receiveHubSpotWebhook } from "@/integrations/hubspot/triggers/webhookReceived/receive";

const SECRET = "hubspot_test_client_secret";
const APP_ID = "11223344";
const URL = "https://app.example.test/api/webhooks/hubspot";
const NOW_MS = 1_700_000_000_000;

function sign(body: string, timestampMs: number, uri: string = URL): string {
  const canonical = `POST${uri}${body}${timestampMs}`;
  return createHmac("sha256", SECRET).update(canonical, "utf8").digest("base64");
}

function req(opts: {
  body?: string;
  sig?: string | null;
  timestamp?: string | null;
  url?: string;
}): Request {
  const body = opts.body ?? "[]";
  const headers: Record<string, string> = {};
  if (opts.sig !== null) headers["X-HubSpot-Signature-V3"] = opts.sig ?? sign(body, NOW_MS);
  if (opts.timestamp !== null) headers["X-HubSpot-Request-Timestamp"] = opts.timestamp ?? String(NOW_MS);
  return new Request(opts.url ?? URL, { method: "POST", body, headers });
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 12345,
    subscriptionId: 67890,
    portalId: 9988776,
    appId: 11223344,
    occurredAt: NOW_MS,
    subscriptionType: "contact.creation",
    attemptNumber: 0,
    objectId: 5001,
    ...overrides,
  };
}

beforeEach(() => {
  mockAppSubsFind.mockReset();
  mockRefsList.mockReset();
});

describe("receiveHubSpotWebhook — signature verification", () => {
  it("throws InvalidSignatureError on missing X-HubSpot-Signature-V3", async () => {
    const body = JSON.stringify([makeEvent()]);
    await expect(
      receiveHubSpotWebhook(req({ body, sig: null }), {
        secret: SECRET,
        appId: APP_ID,
        requestUriOverride: URL,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(InvalidSignatureError);
  });

  it("throws InvalidSignatureError on signature mismatch", async () => {
    const body = JSON.stringify([makeEvent()]);
    await expect(
      receiveHubSpotWebhook(req({ body, sig: "AAAA" }), {
        secret: SECRET,
        appId: APP_ID,
        requestUriOverride: URL,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(/signature verification failed/);
  });

  it("throws SignatureExpiredError when timestamp is outside the 5-minute tolerance", async () => {
    const oldMs = NOW_MS - 6 * 60 * 1000;
    const body = JSON.stringify([makeEvent()]);
    await expect(
      receiveHubSpotWebhook(
        req({ body, sig: sign(body, oldMs), timestamp: String(oldMs) }),
        {
          secret: SECRET,
          appId: APP_ID,
          requestUriOverride: URL,
          nowMs: NOW_MS,
        },
      ),
    ).rejects.toThrow(SignatureExpiredError);
  });

  it("throws InvalidSignatureError when HUBSPOT_CLIENT_SECRET is unset (no override)", async () => {
    const body = JSON.stringify([makeEvent()]);
    // No `secret` override AND no env — verifier should fail with the
    // missing-secret path.
    delete process.env.HUBSPOT_CLIENT_SECRET;
    await expect(
      receiveHubSpotWebhook(req({ body }), {
        appId: APP_ID,
        requestUriOverride: URL,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(/HUBSPOT_CLIENT_SECRET/);
  });

  it("throws InvalidSignatureError when raw body is mutated after signing (whitespace)", async () => {
    const original = JSON.stringify([makeEvent()]);
    const signature = sign(original, NOW_MS);
    const mutated = original.replace(":", ": "); // add whitespace
    await expect(
      receiveHubSpotWebhook(req({ body: mutated, sig: signature }), {
        secret: SECRET,
        appId: APP_ID,
        requestUriOverride: URL,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(/signature verification failed/);
  });

  it("throws InvalidSignatureError on empty body", async () => {
    await expect(
      receiveHubSpotWebhook(req({ body: "" }), {
        secret: SECRET,
        appId: APP_ID,
        requestUriOverride: URL,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(/empty body/);
  });

  it("throws InvalidSignatureError when body is not JSON array", async () => {
    const body = '{"not":"array"}';
    await expect(
      receiveHubSpotWebhook(req({ body, sig: sign(body, NOW_MS) }), {
        secret: SECRET,
        appId: APP_ID,
        requestUriOverride: URL,
        nowMs: NOW_MS,
      }),
    ).rejects.toThrow(/not a JSON array/);
  });
});

describe("receiveHubSpotWebhook — routing", () => {
  it("returns delivery with skipReason=unknown_subscription when no app sub matches", async () => {
    mockAppSubsFind.mockResolvedValueOnce(null);
    const body = JSON.stringify([makeEvent()]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      { secret: SECRET, appId: APP_ID, requestUriOverride: URL, nowMs: NOW_MS },
    );
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]!.skipReason).toBe("unknown_subscription");
    expect(result.deliveries[0]!.targets).toEqual([]);
    expect(mockRefsList).not.toHaveBeenCalled();
  });

  it("returns delivery with skipReason=no_matching_refs when app sub exists but no refs for portal", async () => {
    mockAppSubsFind.mockResolvedValueOnce({
      id: "app-sub-1",
      appId: APP_ID,
      eventType: "contact.creation",
      propertyName: null,
      hubspotSubscriptionId: "hs-1",
      status: "active",
      createdAt: "",
      updatedAt: "",
    });
    mockRefsList.mockResolvedValueOnce([]);
    const body = JSON.stringify([makeEvent()]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      { secret: SECRET, appId: APP_ID, requestUriOverride: URL, nowMs: NOW_MS },
    );
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.deliveries[0]!.skipReason).toBe("no_matching_refs");
    expect(mockRefsList).toHaveBeenCalledWith({
      appSubscriptionId: "app-sub-1",
      hubId: "9988776",
    });
  });

  it("returns delivery with N targets when N refs match the portal", async () => {
    mockAppSubsFind.mockResolvedValueOnce({
      id: "app-sub-1",
      appId: APP_ID,
      eventType: "contact.creation",
      propertyName: null,
      hubspotSubscriptionId: "hs-1",
      status: "active",
      createdAt: "",
      updatedAt: "",
    });
    mockRefsList.mockResolvedValueOnce([
      {
        id: "ref-A",
        appSubscriptionId: "app-sub-1",
        workflowId: "wf-A",
        userId: "user-A",
        nodeId: "node-A",
        hubId: "9988776",
        config: {},
        status: "active",
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "ref-B",
        appSubscriptionId: "app-sub-1",
        workflowId: "wf-B",
        userId: "user-B",
        nodeId: "node-B",
        hubId: "9988776",
        config: {},
        status: "active",
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const body = JSON.stringify([makeEvent()]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      { secret: SECRET, appId: APP_ID, requestUriOverride: URL, nowMs: NOW_MS },
    );
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.deliveries[0]!.skipReason).toBeNull();
    expect(result.deliveries[0]!.targets).toHaveLength(2);
    expect(result.deliveries[0]!.targets[0]).toEqual({
      workflowId: "wf-A",
      nodeId: "node-A",
      userId: "user-A",
    });
  });

  it("scopes app-sub lookup by propertyName for propertyChange events", async () => {
    mockAppSubsFind.mockResolvedValueOnce(null);
    const body = JSON.stringify([
      makeEvent({
        subscriptionType: "contact.propertyChange",
        propertyName: "email",
        propertyValue: "new@example.com",
      }),
    ]);
    await receiveHubSpotWebhook(req({ body, sig: sign(body, NOW_MS) }), {
      secret: SECRET,
      appId: APP_ID,
      requestUriOverride: URL,
      nowMs: NOW_MS,
    });
    expect(mockAppSubsFind).toHaveBeenCalledWith({
      appId: APP_ID,
      eventType: "contact.propertyChange",
      propertyName: "email",
    });
  });

  it("forces propertyName=null in the lookup for non-propertyChange events", async () => {
    mockAppSubsFind.mockResolvedValueOnce(null);
    const body = JSON.stringify([
      makeEvent({ subscriptionType: "contact.deletion" }),
    ]);
    await receiveHubSpotWebhook(req({ body, sig: sign(body, NOW_MS) }), {
      secret: SECRET,
      appId: APP_ID,
      requestUriOverride: URL,
      nowMs: NOW_MS,
    });
    expect(mockAppSubsFind).toHaveBeenCalledWith({
      appId: APP_ID,
      eventType: "contact.deletion",
      propertyName: null,
    });
  });

  it("routes each event in a multi-event payload independently", async () => {
    mockAppSubsFind
      .mockResolvedValueOnce({
        id: "app-sub-A",
        appId: APP_ID,
        eventType: "contact.creation",
        propertyName: null,
        hubspotSubscriptionId: "hs-A",
        status: "active",
        createdAt: "",
        updatedAt: "",
      })
      .mockResolvedValueOnce(null);
    mockRefsList.mockResolvedValueOnce([
      {
        id: "ref-1",
        appSubscriptionId: "app-sub-A",
        workflowId: "wf-A",
        userId: "user-A",
        nodeId: "node-A",
        hubId: "9988776",
        config: {},
        status: "active",
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const body = JSON.stringify([
      makeEvent({ eventId: 1, subscriptionType: "contact.creation" }),
      makeEvent({ eventId: 2, subscriptionType: "deal.deletion" }),
    ]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      { secret: SECRET, appId: APP_ID, requestUriOverride: URL, nowMs: NOW_MS },
    );
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.deliveries).toHaveLength(2);
    expect(result.deliveries[0]!.skipReason).toBeNull();
    expect(result.deliveries[0]!.targets).toHaveLength(1);
    expect(result.deliveries[1]!.skipReason).toBe("unknown_subscription");
  });

  it("returns unknown_subscription when HUBSPOT_APP_ID is unset (defense-in-depth ack)", async () => {
    const body = JSON.stringify([makeEvent()]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      {
        secret: SECRET,
        /* appId: undefined */ requestUriOverride: URL,
        nowMs: NOW_MS,
      },
    );
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.deliveries[0]!.skipReason).toBe("unknown_subscription");
    expect(mockAppSubsFind).not.toHaveBeenCalled();
  });

  it("normalizes each event into a canonical TriggerEvent", async () => {
    mockAppSubsFind.mockResolvedValueOnce({
      id: "app-sub-1",
      appId: APP_ID,
      eventType: "contact.creation",
      propertyName: null,
      hubspotSubscriptionId: "hs-1",
      status: "active",
      createdAt: "",
      updatedAt: "",
    });
    mockRefsList.mockResolvedValueOnce([
      {
        id: "ref-1",
        appSubscriptionId: "app-sub-1",
        workflowId: "wf-1",
        userId: "user-1",
        nodeId: "node-1",
        hubId: "9988776",
        config: {},
        status: "active",
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const body = JSON.stringify([makeEvent({ eventId: 5555 })]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      { secret: SECRET, appId: APP_ID, requestUriOverride: URL, nowMs: NOW_MS },
    );
    if (result.kind !== "events") throw new Error("expected events");
    const event = result.deliveries[0]!.event;
    expect(event.provider).toBe("hubspot");
    expect(event.eventType).toBe("webhook_received");
    expect(event.eventId).toBe("5555");
    expect(event.accountId).toBe("9988776");
    expect(event.payload.subscriptionType).toBe("contact.creation");
    expect(event.payload.objectId).toBe("5001");
  });

  // HubSpot 2.1 — ticket.propertyChange + ticket.deletion routing.

  it("dispatches ticket.propertyChange events through the same propertyName-scoped lookup as contact/company/deal (HubSpot 2.1)", async () => {
    mockAppSubsFind.mockResolvedValueOnce({
      id: "app-sub-ticket-pc",
      appId: APP_ID,
      eventType: "ticket.propertyChange",
      propertyName: "hs_pipeline_stage",
      hubspotSubscriptionId: "hs-ticket-pc",
      status: "active",
      createdAt: "",
      updatedAt: "",
    });
    mockRefsList.mockResolvedValueOnce([
      {
        id: "ref-ticket-pc",
        appSubscriptionId: "app-sub-ticket-pc",
        workflowId: "wf-ticket-pc",
        userId: "user-1",
        nodeId: "node-1",
        hubId: "9988776",
        config: {},
        status: "active",
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const body = JSON.stringify([
      makeEvent({
        eventId: 7001,
        subscriptionType: "ticket.propertyChange",
        propertyName: "hs_pipeline_stage",
        propertyValue: "closed",
      }),
    ]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      { secret: SECRET, appId: APP_ID, requestUriOverride: URL, nowMs: NOW_MS },
    );
    expect(mockAppSubsFind).toHaveBeenCalledWith({
      appId: APP_ID,
      eventType: "ticket.propertyChange",
      propertyName: "hs_pipeline_stage",
    });
    if (result.kind !== "events") throw new Error("expected events");
    expect(result.deliveries).toHaveLength(1);
    const event = result.deliveries[0]!.event;
    expect(event.payload.subscriptionType).toBe("ticket.propertyChange");
    expect(event.payload.propertyName).toBe("hs_pipeline_stage");
    expect(event.payload.propertyValue).toBe("closed");
  });

  it("dispatches ticket.deletion events with propertyName=null lookup (HubSpot 2.1)", async () => {
    mockAppSubsFind.mockResolvedValueOnce({
      id: "app-sub-ticket-del",
      appId: APP_ID,
      eventType: "ticket.deletion",
      propertyName: null,
      hubspotSubscriptionId: "hs-ticket-del",
      status: "active",
      createdAt: "",
      updatedAt: "",
    });
    mockRefsList.mockResolvedValueOnce([
      {
        id: "ref-ticket-del",
        appSubscriptionId: "app-sub-ticket-del",
        workflowId: "wf-ticket-del",
        userId: "user-1",
        nodeId: "node-1",
        hubId: "9988776",
        config: {},
        status: "active",
        createdAt: "",
        updatedAt: "",
      },
    ]);
    const body = JSON.stringify([
      makeEvent({ eventId: 7002, subscriptionType: "ticket.deletion" }),
    ]);
    const result = await receiveHubSpotWebhook(
      req({ body, sig: sign(body, NOW_MS) }),
      { secret: SECRET, appId: APP_ID, requestUriOverride: URL, nowMs: NOW_MS },
    );
    expect(mockAppSubsFind).toHaveBeenCalledWith({
      appId: APP_ID,
      eventType: "ticket.deletion",
      propertyName: null,
    });
    if (result.kind !== "events") throw new Error("expected events");
    const event = result.deliveries[0]!.event;
    expect(event.payload.subscriptionType).toBe("ticket.deletion");
  });
});
