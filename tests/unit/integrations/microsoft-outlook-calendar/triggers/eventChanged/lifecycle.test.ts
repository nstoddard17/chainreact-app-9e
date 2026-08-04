/**
 * @jest-environment node
 *
 * microsoft-outlook-calendar/triggers/eventChanged trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockCreateSubscription = jest.fn();
const mockDeleteSubscription = jest.fn();
const mockRenewSubscription = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/microsoft/api/subscriptions", () => ({
  createSubscription: (...args: unknown[]) => mockCreateSubscription(...args),
  deleteSubscription: (...args: unknown[]) => mockDeleteSubscription(...args),
  renewSubscription: (...args: unknown[]) => mockRenewSubscription(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { activate } from "@/integrations/microsoft-outlook-calendar/triggers/eventChanged/activate";
import { deactivate } from "@/integrations/microsoft-outlook-calendar/triggers/eventChanged/deactivate";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import "@/integrations/microsoft-outlook-calendar/triggers/eventChanged";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import type { GraphEvent } from "@/integrations/microsoft-outlook-calendar/api/eventsCreate";
import { normalize, normalizeDeleted } from "@/integrations/microsoft-outlook-calendar/triggers/eventChanged/normalize";
import { outlookCalendarEventChangedSubscriptionHandler } from "@/integrations/microsoft-outlook-calendar/triggers/eventChanged/renew";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCreateSubscription.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.MICROSOFT_GRAPH_WEBHOOK_URL;
});

const baseNode = {
  id: "node-trigger-1",
  kind: "trigger" as const,
  provider: "microsoft-outlook-calendar",
  type: "event_changed",
  config: {},
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-outlook-calendar",
  providerAccountId: "alice@contoso.com",
  displayName: "alice@contoso.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Outlook Calendar event_changed activate", () => {
  it("creates subscription on /me/events with changeType=created,updated,deleted and 70.5h expiration", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-graph-1",
      resource: "/me/events",
      changeType: "created,updated,deleted",
      notificationUrl:
        "https://app.example.test/api/webhooks/microsoft-outlook-calendar",
      expirationDateTime: "2026-05-11T00:00:00.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription).toHaveBeenCalledTimes(1);
    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/me/events");
    expect(call.changeType).toBe("created,updated,deleted");
    expect(call.notificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-outlook-calendar",
    );
    expect(call.lifecycleNotificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-outlook-calendar/lifecycle",
    );
    // Expiration must be ~4230 minutes (70.5h) from now.
    const expiresAt = Date.parse(call.expirationDateTime);
    const expected = Date.now() + 4230 * 60 * 1000;
    // Allow 60s skew for test timing.
    expect(Math.abs(expiresAt - expected)).toBeLessThan(60_000);

    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      resource: "/me/events",
      changeType: "created,updated,deleted",
      subscriptionId: "sub-graph-1",
      expiresAt: "2026-05-11T00:00:00.000Z",
    });
    expect(typeof result.clientState).toBe("string");
  });

  it("generates a 64-char hex clientState (32 random bytes)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/events",
      changeType: "created,updated,deleted",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.clientState).toMatch(/^[0-9a-f]{64}$/);
    // Sent in the request, not just stored locally.
    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.clientState).toBe(result.clientState);
  });

  it("uses Graph's authoritative expirationDateTime in the persisted config (Graph may round)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "s",
      resource: "/me/events",
      changeType: "created,updated,deleted",
      notificationUrl: "x",
      // Graph returned a slightly DIFFERENT timestamp than we requested
      // (truncated/rounded). The persisted value reflects what Graph
      // accepted, not what we asked for.
      expirationDateTime: "2026-05-10T23:59:59.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.expiresAt).toBe("2026-05-10T23:59:59.000Z");
  });

  it("each activation generates a fresh clientState (no reuse)", async () => {
    mockCreateSubscription.mockResolvedValue({
      id: "s",
      resource: "/me/events",
      changeType: "created,updated,deleted",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    const r1 = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });
    const r2 = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(r1.clientState).not.toBe(r2.clientState);
  });

  it("threads userId + accountId + microsoft-outlook-calendar provider through refreshAndRetry", async () => {
    mockCreateSubscription.mockResolvedValue({
      id: "s",
      resource: "/me/events",
      changeType: "created,updated,deleted",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook-calendar",
        providerAccountId: "alice@contoso.com",
      }),
    );
  });

  it("uses MICROSOFT_GRAPH_WEBHOOK_URL when set, stripping any trailing /api/webhooks/microsoft-outlook-calendar", async () => {
    process.env.MICROSOFT_GRAPH_WEBHOOK_URL =
      "https://tunnel.example.test/api/webhooks/microsoft-outlook-calendar";

    mockCreateSubscription.mockResolvedValue({
      id: "s",
      resource: "/me/events",
      changeType: "created,updated,deleted",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.notificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-outlook-calendar",
    );
    expect(call.lifecycleNotificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-outlook-calendar/lifecycle",
    );
  });

  it("MICROSOFT_GRAPH_WEBHOOK_URL pointing at the mail path is stripped to root before appending /microsoft-outlook-calendar", async () => {
    // The same env var is shared with Slice 6 mail; setting it to the
    // mail webhook path must NOT generate
    // /api/webhooks/microsoft-outlook/api/webhooks/microsoft-outlook-calendar.
    process.env.MICROSOFT_GRAPH_WEBHOOK_URL =
      "https://tunnel.example.test/api/webhooks/microsoft-outlook";

    mockCreateSubscription.mockResolvedValue({
      id: "s",
      resource: "/me/events",
      changeType: "created,updated,deleted",
      notificationUrl: "x",
      expirationDateTime: "x",
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.notificationUrl).toBe(
      "https://tunnel.example.test/api/webhooks/microsoft-outlook-calendar",
    );
  });

  it("propagates createSubscription failures verbatim (lifecycle wraps with TRIGGER_REGISTRATION_FAILED)", async () => {
    mockCreateSubscription.mockRejectedValueOnce(
      new Error("Subscription validation request failed"),
    );

    await expect(
      activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" }),
    ).rejects.toThrow(/validation request failed/);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDeleteSubscription.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "microsoft-outlook-calendar",
  eventType: "event_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-graph-1",
    clientState: "deadbeef",
    resource: "/me/events",
    changeType: "created,updated,deleted",
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-outlook-calendar",
  providerAccountId: "alice@contoso.com",
  displayName: "alice@contoso.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Outlook Calendar event_changed deactivate", () => {
  it("DELETEs the Graph subscription via deleteSubscription wrapper", async () => {
    mockDeleteSubscription.mockResolvedValueOnce(undefined);

    await deactivate({ trigger: baseTrigger, integration: baseIntegration });

    expect(mockDeleteSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        subscriptionId: "sub-graph-1",
      }),
    );
  });

  it("threads microsoft-outlook-calendar provider through refreshAndRetry (NOT mail provider)", async () => {
    mockDeleteSubscription.mockResolvedValueOnce(undefined);

    await deactivate({ trigger: baseTrigger, integration: baseIntegration });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook-calendar",
      }),
    );
  });

  it("no-ops when type is not subscription-watch (defensive)", async () => {
    await deactivate({
      trigger: { ...baseTrigger, config: { type: "polling" } },
      integration: baseIntegration,
    });
    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });

  it("no-ops when subscriptionId is missing (partial activate state)", async () => {
    await deactivate({
      trigger: {
        ...baseTrigger,
        config: { type: "subscription-watch" },
      },
      integration: baseIntegration,
    });
    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });

  it("swallows NotFoundError (subscription already gone)", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(new NotFoundError("sub-1"));

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("swallows 403 / ErrorAccessDenied (V1 reasoning — Graph auto-cleans on expiry)", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions DELETE failed: ErrorAccessDenied"),
    );

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors (orchestrator catches and continues row deletion)", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions DELETE failed: HTTP 500"),
    );

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).rejects.toThrow(/500/);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former index.test.ts
// Module-init registration assertions for the Outlook Calendar
// event_changed trigger. The activation / deactivation / subscription
// registries are populated as a side effect of importing the index
// module from `integrations/_registry.ts`. Importing the trigger module
// here exercises the same wiring.
// Test layout note: the registries hold module-scoped state. Resetting
// + re-importing between tests doesn't re-fire the side effects (Jest
// caches the module). Instead we import ONCE at the top, then assert
// the state shape across multiple tests.
// ---------------------------------------------------------------------------
describe("index (lifecycle)", () => {

const triggerRow = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "microsoft-outlook-calendar",
  eventType: "event_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-1",
    clientState: "x",
    resource: "/me/events",
    changeType: "created,updated,deleted",
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Outlook Calendar event_changed trigger module-init registration", () => {
  it("registers an activation handler under (microsoft-outlook-calendar, event_changed)", () => {
    expect(
      findActivation("microsoft-outlook-calendar", "event_changed"),
    ).not.toBeNull();
  });

  it("registers a deactivation handler under (microsoft-outlook-calendar, event_changed)", () => {
    expect(
      findDeactivation("microsoft-outlook-calendar", "event_changed"),
    ).not.toBeNull();
  });

  it("registers a subscription handler that canHandle subscription-watch rows for this provider+event", () => {
    const handler = findSubscriptionHandler(triggerRow);
    expect(handler).not.toBeNull();
    expect(handler?.id).toBe("microsoft-outlook-calendar:event_changed");
  });

  it("subscription handler does NOT match the mail provider's new_email rows (provider isolation)", () => {
    const mailRow = {
      ...triggerRow,
      provider: "microsoft-outlook",
      eventType: "new_email",
      config: { ...triggerRow.config, resource: "/me/messages" },
    };
    // The mail trigger may also be registered if other tests imported
    // it; what matters here is that the calendar handler doesn't claim
    // mail rows. Filter by id to verify isolation.
    const handler = findSubscriptionHandler(mailRow);
    expect(handler?.id).not.toBe("microsoft-outlook-calendar:event_changed");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

const CONTEXT = {
  subscriptionId: "sub-1",
  changeType: "created",
  notificationOccurredAt: "2026-05-08T12:00:00Z",
  providerAccountId: "alice@contoso.com",
};

describe("Outlook Calendar event_changed normalize", () => {
  it("produces the canonical TriggerEvent shape from a Graph event", () => {
    // Body contentType is typed as "Text" | "HTML" upstream, but Graph
    // sometimes returns lowercase. Cast through GraphEvent to exercise
    // the normalizer's defensive lowercasing.
    const event = normalize(
      {
        id: "evt-1",
        subject: "Project sync",
        body: {
          contentType: "html" as unknown as "HTML",
          content: "<p>Quarterly review</p>",
        },
        start: { dateTime: "2026-05-15T14:00:00", timeZone: "America/New_York" },
        end: { dateTime: "2026-05-15T15:00:00", timeZone: "America/New_York" },
        isAllDay: false,
        location: { displayName: "Conference Room A" },
        attendees: [
          {
            emailAddress: { name: "Bob", address: "bob@x.com" },
            type: "required",
            status: { response: "accepted", time: "2026-05-08T11:00:00Z" },
          },
          {
            emailAddress: { name: "Carol", address: "carol@x.com" },
            type: "optional",
          },
        ],
        organizer: {
          emailAddress: { name: "Alice", address: "alice@contoso.com" },
        },
        isOnlineMeeting: true,
        onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meet/abc" },
        importance: "high",
        sensitivity: "confidential",
        webLink: "https://outlook.office.com/calendar/...",
        createdDateTime: "2026-05-08T10:30:00Z",
        lastModifiedDateTime: "2026-05-08T11:00:00Z",
      },
      CONTEXT,
    );

    expect(event).toEqual({
      provider: "microsoft-outlook-calendar",
      eventType: "event_changed",
      eventId: "sub-1:evt-1:created",
      occurredAt: "2026-05-08T11:00:00Z",
      providerAccountId: "alice@contoso.com",
      payload: {
        eventId: "evt-1",
        changeType: "created",
        subject: "Project sync",
        start: {
          dateTime: "2026-05-15T14:00:00",
          timeZone: "America/New_York",
        },
        end: { dateTime: "2026-05-15T15:00:00", timeZone: "America/New_York" },
        isAllDay: false,
        location: "Conference Room A",
        body: { contentType: "html", content: "<p>Quarterly review</p>" },
        attendees: [
          {
            name: "Bob",
            address: "bob@x.com",
            type: "required",
            status: { response: "accepted", time: "2026-05-08T11:00:00Z" },
          },
          {
            name: "Carol",
            address: "carol@x.com",
            type: "optional",
            status: { response: "none", time: null },
          },
        ],
        organizer: { name: "Alice", address: "alice@contoso.com" },
        isOnlineMeeting: true,
        onlineMeetingUrl: "https://teams.microsoft.com/l/meet/abc",
        webLink: "https://outlook.office.com/calendar/...",
        importance: "high",
        sensitivity: "confidential",
        createdDateTime: "2026-05-08T10:30:00Z",
        lastModifiedDateTime: "2026-05-08T11:00:00Z",
      },
    });
  });

  it("dedup key shape is ${subscriptionId}:${eventId}:${changeType}", () => {
    const event = normalize(
      { id: "graph-evt-X" },
      { ...CONTEXT, subscriptionId: "sub-XYZ", changeType: "updated" },
    );
    expect(event.eventId).toBe("sub-XYZ:graph-evt-X:updated");
  });

  it("surfaces changeType from the notification context, not the body", () => {
    // Graph events don't carry a changeType field on the body; the
    // notification envelope is the only authoritative source for which
    // CRUD operation triggered the notification.
    const event = normalize({ id: "evt" }, { ...CONTEXT, changeType: "updated" });
    expect(event.payload.changeType).toBe("updated");
  });

  it("uses lastModifiedDateTime > createdDateTime > notification fallback for occurredAt", () => {
    const r1 = normalize(
      { id: "e", lastModifiedDateTime: "1", createdDateTime: "0" },
      CONTEXT,
    );
    expect(r1.occurredAt).toBe("1");

    const r2 = normalize({ id: "e", createdDateTime: "0" }, CONTEXT);
    expect(r2.occurredAt).toBe("0");

    const r3 = normalize({ id: "e" }, CONTEXT);
    expect(r3.occurredAt).toBe("2026-05-08T12:00:00Z");
  });

  it("normalizes body contentType to lowercase 'html' or 'text' (defensively)", () => {
    const html = normalize(
      { id: "e1", body: { contentType: "HTML", content: "x" } },
      CONTEXT,
    );
    expect(html.payload.body).toEqual({ contentType: "html", content: "x" });

    const text = normalize(
      { id: "e2", body: { contentType: "Text", content: "x" } },
      CONTEXT,
    );
    expect(text.payload.body).toEqual({ contentType: "text", content: "x" });

    // Unknown values default to "text" rather than passing through.
    // Cast through GraphEvent to bypass the upstream "Text" | "HTML"
    // tightness — the normalizer is intentionally permissive at runtime.
    const weird = normalize(
      {
        id: "e3",
        body: { contentType: "richtext" as unknown as "HTML", content: "x" },
      } as GraphEvent,
      CONTEXT,
    );
    expect((weird.payload.body as { contentType: string }).contentType).toBe(
      "text",
    );
  });

  it("body: null when Graph omits the body field entirely", () => {
    const event = normalize({ id: "e" }, CONTEXT);
    expect(event.payload.body).toBeNull();
  });

  it("location is the Graph displayName string, not the wrapper object", () => {
    const event = normalize(
      { id: "e", location: { displayName: "Hybrid" } },
      CONTEXT,
    );
    expect(event.payload.location).toBe("Hybrid");
  });

  it("location: null when Graph omits the location field", () => {
    const event = normalize({ id: "e" }, CONTEXT);
    expect(event.payload.location).toBeNull();
  });

  it("organizer falls through to null when emailAddress.address is missing", () => {
    const event = normalize(
      { id: "e", organizer: { emailAddress: { name: "Alice" } } },
      CONTEXT,
    );
    expect(event.payload.organizer).toBeNull();
  });

  it("filters attendees with no address (Graph occasionally returns blanks)", () => {
    const event = normalize(
      {
        id: "e",
        attendees: [
          {
            emailAddress: { address: "real@x.com" },
            type: "required",
          },
          { emailAddress: {}, type: "optional" } as unknown as never,
          {
            emailAddress: { address: "another@x.com" },
            type: "resource",
          },
        ],
      },
      CONTEXT,
    );
    expect(event.payload.attendees).toEqual([
      {
        name: "",
        address: "real@x.com",
        type: "required",
        status: { response: "none", time: null },
      },
      {
        name: "",
        address: "another@x.com",
        type: "resource",
        status: { response: "none", time: null },
      },
    ]);
  });

  it("defaults importance to 'normal', sensitivity to 'normal', isAllDay/isOnlineMeeting to false", () => {
    const event = normalize({ id: "e" }, CONTEXT);
    expect(event.payload.importance).toBe("normal");
    expect(event.payload.sensitivity).toBe("normal");
    expect(event.payload.isAllDay).toBe(false);
    expect(event.payload.isOnlineMeeting).toBe(false);
    expect(event.payload.onlineMeetingUrl).toBeNull();
    expect(event.payload.webLink).toBeNull();
  });
});

describe("Outlook Calendar event_changed normalizeDeleted", () => {
  it("emits a stable minimal payload with subject: null when GET 404s after a delete notification", () => {
    const event = normalizeDeleted("evt-deleted", {
      ...CONTEXT,
      changeType: "deleted",
    });

    expect(event).toEqual({
      provider: "microsoft-outlook-calendar",
      eventType: "event_changed",
      eventId: "sub-1:evt-deleted:deleted",
      occurredAt: "2026-05-08T12:00:00Z",
      providerAccountId: "alice@contoso.com",
      payload: {
        eventId: "evt-deleted",
        changeType: "deleted",
        subject: null,
        start: null,
        end: null,
        isAllDay: false,
        location: null,
        body: null,
        attendees: [],
        organizer: null,
        isOnlineMeeting: false,
        onlineMeetingUrl: null,
        webLink: null,
        importance: "normal",
        sensitivity: "normal",
        createdDateTime: null,
        lastModifiedDateTime: null,
      },
    });
  });

  it("dedup key shape matches normalize() so deleted events dedup against the same key the receiver would produce on a successful fetch", () => {
    const event = normalizeDeleted("evt-X", {
      ...CONTEXT,
      subscriptionId: "sub-Y",
      changeType: "deleted",
    });
    expect(event.eventId).toBe("sub-Y:evt-X:deleted");
  });

  it("payload key set is identical to normalize() (workflow authors see one stable shape)", () => {
    const full = normalize({ id: "e" }, CONTEXT);
    const deleted = normalizeDeleted("e", CONTEXT);

    const fullKeys = Object.keys(full.payload).sort();
    const deletedKeys = Object.keys(deleted.payload).sort();

    expect(deletedKeys).toEqual(fullKeys);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former renew.test.ts
// ---------------------------------------------------------------------------
describe("renew (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRenewSubscription.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "microsoft-outlook-calendar",
  eventType: "event_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    subscriptionId: "sub-graph-1",
    clientState: "deadbeef",
    resource: "/me/events",
    changeType: "created,updated,deleted",
    expiresAt: "2026-05-09T12:00:00.000Z",
  },
  providerAccountId: "alice@contoso.com",
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-outlook-calendar",
  providerAccountId: "alice@contoso.com",
  displayName: "alice@contoso.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("outlookCalendarEventChangedSubscriptionHandler", () => {
  it("identifies itself with id 'microsoft-outlook-calendar:event_changed'", () => {
    expect(outlookCalendarEventChangedSubscriptionHandler.id).toBe(
      "microsoft-outlook-calendar:event_changed",
    );
  });

  it("canHandle matches subscription-watch rows for microsoft-outlook-calendar/event_changed", () => {
    expect(
      outlookCalendarEventChangedSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);

    expect(
      outlookCalendarEventChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        provider: "microsoft-outlook",
      }),
    ).toBe(false);

    expect(
      outlookCalendarEventChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "different",
      }),
    ).toBe(false);

    expect(
      outlookCalendarEventChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        config: { ...baseTrigger.config, type: "polling" },
      }),
    ).toBe(false);
  });

  it("declares 1h renewal threshold (60 * 60 * 1000 ms)", () => {
    expect(
      outlookCalendarEventChangedSubscriptionHandler.getRenewalThresholdMs(),
    ).toBe(60 * 60 * 1000);
  });

  it("PATCHes the subscription with a fresh +4230-minute expiration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-graph-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await outlookCalendarEventChangedSubscriptionHandler.renew({
      trigger: baseTrigger,
    });

    expect(mockRenewSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "tok",
        subscriptionId: "sub-graph-1",
      }),
    );
    const requestedExpiry = Date.parse(
      mockRenewSubscription.mock.calls[0]![0].expirationDateTime,
    );
    const expected = Date.now() + 4230 * 60 * 1000;
    expect(Math.abs(requestedExpiry - expected)).toBeLessThan(60_000);
  });

  it("persists Graph's authoritative new expiresAt back to config (preserves clientState + subscriptionId + changeType)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-graph-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await outlookCalendarEventChangedSubscriptionHandler.renew({
      trigger: baseTrigger,
    });

    expect(mockUpdateConfig).toHaveBeenCalledWith("tr-1", {
      type: "subscription-watch",
      subscriptionId: "sub-graph-1",
      clientState: "deadbeef",
      resource: "/me/events",
      changeType: "created,updated,deleted",
      expiresAt: "2026-05-15T00:00:00.000Z",
    });
  });

  it("threads microsoft-outlook-calendar provider through refreshAndRetry (NOT mail)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-graph-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await outlookCalendarEventChangedSubscriptionHandler.renew({
      trigger: baseTrigger,
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft-outlook-calendar",
      }),
    );
  });

  it("throws when subscriptionId is missing from config (partial activate state)", async () => {
    await expect(
      outlookCalendarEventChangedSubscriptionHandler.renew({
        trigger: {
          ...baseTrigger,
          config: { ...baseTrigger.config, subscriptionId: undefined },
        },
      }),
    ).rejects.toThrow(/missing subscriptionId/);
  });

  it("throws when no active integration row exists (user disconnected)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);

    await expect(
      outlookCalendarEventChangedSubscriptionHandler.renew({
        trigger: baseTrigger,
      }),
    ).rejects.toThrow(/no active integration/);
  });

  it("propagates renewSubscription errors (runRenewals counts as error and skips persistence)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockRenewSubscription.mockRejectedValueOnce(
      new Error("Microsoft Graph subscriptions PATCH failed: HTTP 410"),
    );

    await expect(
      outlookCalendarEventChangedSubscriptionHandler.renew({
        trigger: baseTrigger,
      }),
    ).rejects.toThrow(/HTTP 410/);
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});

});
