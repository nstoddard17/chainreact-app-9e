/**
 * @jest-environment node
 *
 * microsoft-teams/triggers/newChannelMessage trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockCreateSubscription = jest.fn();
const mockDeleteSubscription = jest.fn();
const mockChannelMessageGet = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockRenewSubscription = jest.fn();
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

jest.mock("@/integrations/_shared/microsoft/api/errors", () => {
  class NotFoundError extends Error {
    readonly resource: string;
    constructor(resource: string) {
      super(`resource '${resource}' not found`);
      this.resource = resource;
      this.name = "NotFoundError";
    }
  }
  return { NotFoundError };
});

jest.mock("@/integrations/microsoft-teams/api/channelMessageGet", () => ({
  channelMessageGet: (...args: unknown[]) => mockChannelMessageGet(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { activate } from "@/integrations/microsoft-teams/triggers/newChannelMessage/activate";
import { deactivate } from "@/integrations/microsoft-teams/triggers/newChannelMessage/deactivate";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { findActivation } from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
import { findSubscriptionHandler } from "@/services/triggers/subscriptionRegistry";
import "@/integrations/microsoft-teams/triggers/newChannelMessage";
import { normalize } from "@/integrations/microsoft-teams/triggers/newChannelMessage/normalize";
import type { ChatMessageResource } from "@/integrations/microsoft-teams/api/types";
import { pull } from "@/integrations/microsoft-teams/triggers/newChannelMessage/pull";
import { teamsNewChannelMessageSubscriptionHandler } from "@/integrations/microsoft-teams/triggers/newChannelMessage/renew";

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
  provider: "microsoft-teams",
  type: "new_channel_message",
  config: { teamId: "team-1", channelId: "ch-1" },
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-teams",
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

describe("Teams new_channel_message activate", () => {
  it("creates subscription on /teams/{teamId}/channels/{channelId}/messages with changeType=created", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-1",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      notificationUrl:
        "https://app.example.test/api/webhooks/microsoft-teams",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    expect(call.resource).toBe("/teams/team-1/channels/ch-1/messages");
    expect(call.changeType).toBe("created");
    expect(call.notificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-teams",
    );
    expect(call.lifecycleNotificationUrl).toBe(
      "https://app.example.test/api/webhooks/microsoft-teams/lifecycle",
    );
  });

  it("expirationDateTime is ~4230 minutes (~70.5h) in the future", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-1",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    const before = Date.now();
    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    const after = Date.now();

    const callExp = new Date(
      mockCreateSubscription.mock.calls[0]![0].expirationDateTime,
    ).getTime();
    const expectedMinMs = before + 4230 * 60 * 1000 - 1000; // -1s tolerance
    const expectedMaxMs = after + 4230 * 60 * 1000 + 1000; // +1s tolerance
    expect(callExp).toBeGreaterThanOrEqual(expectedMinMs);
    expect(callExp).toBeLessThanOrEqual(expectedMaxMs);
  });

  it("does NOT set includeResourceData (Graph defaults to false — Batch 1 avoids encryption certs)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-1",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    const call = mockCreateSubscription.mock.calls[0]![0];
    // The shared wrapper's CreateSubscriptionInput doesn't accept
    // includeResourceData; this assertion enforces that the activate
    // hook does NOT smuggle the field in via the input object.
    expect("includeResourceData" in call).toBe(false);
  });

  it("generates a 32-byte hex clientState (64 hex chars)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-1",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.clientState).toMatch(/^[0-9a-f]{64}$/);
    expect(mockCreateSubscription.mock.calls[0]![0].clientState).toBe(
      result.clientState,
    );
  });

  it("clientState does NOT leak workflow id (V1 rot fix)", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-1",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    // V1 set clientState: `workflow_${workflowId}` — leaky. V2 uses
    // random bytes.
    expect(result.clientState).not.toContain("workflow_");
    expect(result.clientState).not.toContain("wf-test");
  });

  it("stores subscription metadata for later renewal + receive lookup", async () => {
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-graph-id",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result).toEqual({
      teamId: "team-1",
      channelId: "ch-1",
      type: "subscription-watch",
      webhookEnabled: true,
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      subscriptionId: "sub-graph-id",
      clientState: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
      expiresAt: "2026-05-12T00:00:00.000Z",
    });
  });

  it("honors MICROSOFT_GRAPH_WEBHOOK_URL env override", async () => {
    process.env.MICROSOFT_GRAPH_WEBHOOK_URL = "https://override.example.test";
    mockCreateSubscription.mockResolvedValueOnce({
      id: "sub-1",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      notificationUrl: "x",
      expirationDateTime: "2026-05-12T00:00:00.000Z",
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockCreateSubscription.mock.calls[0]![0].notificationUrl).toBe(
      "https://override.example.test/api/webhooks/microsoft-teams",
    );
  });

  it("rejects activation when teamId is missing (Zod fails closed)", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { teamId: "", channelId: "ch-1" },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow();
    expect(mockCreateSubscription).not.toHaveBeenCalled();
  });

  it("rejects activation when channelId is missing", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { teamId: "team-1", channelId: "" },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow();
  });

  it("propagates subscription-create errors so orchestrator records TRIGGER_REGISTRATION_FAILED", async () => {
    mockCreateSubscription.mockRejectedValueOnce(
      new Error("Graph validation failed"),
    );

    await expect(
      activate({
        node: baseNode,
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/Graph validation failed/);
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

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-teams",
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

function trigger(config: Record<string, unknown>) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "microsoft-teams",
    eventType: "new_channel_message",
    nodeId: "n-1",
    config,
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("Teams new_channel_message deactivate", () => {
  it("deletes the Graph subscription", async () => {
    mockDeleteSubscription.mockResolvedValueOnce(undefined);

    await deactivate({
      trigger: trigger({
        type: "subscription-watch",
        subscriptionId: "sub-1",
      }),
      integration: baseIntegration,
    });

    expect(mockDeleteSubscription).toHaveBeenCalledTimes(1);
    expect(mockDeleteSubscription.mock.calls[0]![0].subscriptionId).toBe(
      "sub-1",
    );
  });

  it("swallows NotFoundError (subscription already gone)", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(new NotFoundError("sub-1"));

    await expect(
      deactivate({
        trigger: trigger({
          type: "subscription-watch",
          subscriptionId: "sub-1",
        }),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows 403 ErrorAccessDenied (token lacks permission)", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(
      new Error("HTTP 403 ErrorAccessDenied"),
    );

    await expect(
      deactivate({
        trigger: trigger({
          type: "subscription-watch",
          subscriptionId: "sub-1",
        }),
        integration: baseIntegration,
      }),
    ).resolves.toBeUndefined();
  });

  it("propagates other errors so orchestrator can decide", async () => {
    mockDeleteSubscription.mockRejectedValueOnce(
      new Error("HTTP 500 internal"),
    );

    await expect(
      deactivate({
        trigger: trigger({
          type: "subscription-watch",
          subscriptionId: "sub-1",
        }),
        integration: baseIntegration,
      }),
    ).rejects.toThrow(/500/);
  });

  it("skips deletion when type is not subscription-watch", async () => {
    await deactivate({
      trigger: trigger({
        type: "polling",
        subscriptionId: "sub-1",
      }),
      integration: baseIntegration,
    });

    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });

  it("skips deletion when subscriptionId is absent", async () => {
    await deactivate({
      trigger: trigger({ type: "subscription-watch" }),
      integration: baseIntegration,
    });

    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former index.test.ts
// ---------------------------------------------------------------------------
describe("index (lifecycle)", () => {

// Side-effect import forces module-init registrations.
function fakeTrigger(): import("@/repositories/triggerResources").TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "microsoft-teams",
    eventType: "new_channel_message",
    nodeId: "n-1",
    config: { type: "subscription-watch" },
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("Teams new_channel_message module registration", () => {
  it("registers an activation fn for (microsoft-teams, new_channel_message)", () => {
    expect(
      findActivation("microsoft-teams", "new_channel_message"),
    ).not.toBeNull();
  });

  it("registers a deactivation fn for (microsoft-teams, new_channel_message)", () => {
    expect(
      findDeactivation("microsoft-teams", "new_channel_message"),
    ).not.toBeNull();
  });

  it("registers a subscription handler that canHandle the Teams subscription-watch trigger", () => {
    const handler = findSubscriptionHandler(fakeTrigger());
    expect(handler).not.toBeNull();
    expect(handler!.id).toBe("microsoft-teams:new_channel_message");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

function ctx() {
  return {
    subscriptionId: "sub-1",
    teamId: "team-1",
    channelId: "ch-1",
    notificationOccurredAt: "2026-05-10T12:00:00.000Z",
    providerAccountId: "alice@contoso.com",
  };
}

describe("Teams new_channel_message normalize", () => {
  it("produces the canonical V2 TriggerEvent shape", () => {
    const message: ChatMessageResource = {
      id: "msg-1",
      createdDateTime: "2026-05-10T12:01:00.000Z",
      lastModifiedDateTime: "2026-05-10T12:01:30.000Z",
      subject: "Project update",
      summary: "Project update preview",
      importance: "high",
      messageType: "message",
      replyToId: null,
      body: { contentType: "html", content: "<p>Hello team</p>" },
      from: { user: { id: "u-1", displayName: "Alice" } },
      webUrl: "https://teams.microsoft.com/l/msg",
    };

    const event = normalize(message, ctx());

    expect(event).toEqual({
      provider: "microsoft-teams",
      eventType: "new_channel_message",
      eventId: "sub-1:msg-1:created",
      occurredAt: "2026-05-10T12:01:00.000Z",
      providerAccountId: "alice@contoso.com",
      payload: {
        messageId: "msg-1",
        teamId: "team-1",
        channelId: "ch-1",
        subject: "Project update",
        bodyContent: "<p>Hello team</p>",
        bodyContentType: "html",
        bodyPreview: "Project update preview",
        importance: "high",
        messageType: "message",
        replyToId: null,
        fromUserId: "u-1",
        fromUserDisplayName: "Alice",
        createdDateTime: "2026-05-10T12:01:00.000Z",
        lastModifiedDateTime: "2026-05-10T12:01:30.000Z",
        webUrl: "https://teams.microsoft.com/l/msg",
        changeType: "created",
      },
    });
  });

  it("dedup key follows ${subscriptionId}:${messageId}:created", () => {
    const event = normalize({ id: "msg-99" }, ctx());
    expect(event.eventId).toBe("sub-1:msg-99:created");
  });

  it("falls back to notificationOccurredAt when message has no createdDateTime", () => {
    const event = normalize({ id: "m" }, ctx());
    expect(event.occurredAt).toBe("2026-05-10T12:00:00.000Z");
  });

  it("normalizes every missing optional field to null/empty (stable downstream contract)", () => {
    const event = normalize({ id: "m" }, ctx());

    expect(event.payload).toMatchObject({
      messageId: "m",
      teamId: "team-1",
      channelId: "ch-1",
      subject: null,
      bodyContent: "",
      bodyContentType: null,
      bodyPreview: null,
      importance: null,
      messageType: null,
      replyToId: null,
      fromUserId: null,
      fromUserDisplayName: null,
      createdDateTime: null,
      lastModifiedDateTime: null,
      webUrl: null,
      changeType: "created",
    });
  });

  it("preserves a non-null replyToId (reply message in a channel thread)", () => {
    const event = normalize(
      { id: "reply-1", replyToId: "parent-1" },
      ctx(),
    );
    expect(event.payload).toMatchObject({
      messageId: "reply-1",
      replyToId: "parent-1",
    });
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former pull.test.ts
// ---------------------------------------------------------------------------
describe("pull (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockChannelMessageGet.mockReset();
  mockGetActiveForExecution.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockGetActiveForExecution.mockResolvedValue({
    userId: "user-1",
    providerAccountId: "alice@contoso.com",
  });
});

function trigger(config: Record<string, unknown>) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "microsoft-teams",
    eventType: "new_channel_message",
    nodeId: "n-1",
    config,
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

const validConfig = {
  type: "subscription-watch",
  subscriptionId: "sub-1",
  teamId: "team-1",
  channelId: "ch-1",
  clientState: "x",
};

describe("Teams new_channel_message pull (hydration)", () => {
  it("id-fetches the message via Graph and returns one normalized TriggerEvent", async () => {
    mockChannelMessageGet.mockResolvedValueOnce({
      id: "msg-1",
      createdDateTime: "2026-05-10T12:00:00.000Z",
      body: { contentType: "html", content: "hi" },
    });

    const result = await pull(
      trigger(validConfig),
      "msg-1",
      "2026-05-10T12:00:01.000Z",
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.eventId).toBe("sub-1:msg-1:created");
    expect(result.events[0]!.payload).toMatchObject({
      messageId: "msg-1",
      teamId: "team-1",
      channelId: "ch-1",
    });
    expect(mockChannelMessageGet.mock.calls[0]![0]).toMatchObject({
      teamId: "team-1",
      channelId: "ch-1",
      messageId: "msg-1",
    });
  });

  it("returns zero events on 404 (message deleted between notification + fetch)", async () => {
    mockChannelMessageGet.mockRejectedValueOnce(new NotFoundError("msg-1"));

    const result = await pull(
      trigger(validConfig),
      "msg-1",
      "2026-05-10T12:00:01.000Z",
    );

    expect(result.events).toEqual([]);
  });

  it("returns zero events when integration row is gone", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);

    const result = await pull(
      trigger(validConfig),
      "msg-1",
      "2026-05-10T12:00:01.000Z",
    );

    expect(result.events).toEqual([]);
    expect(mockChannelMessageGet).not.toHaveBeenCalled();
  });

  it("returns zero events when trigger config is missing required fields", async () => {
    const result = await pull(
      trigger({ type: "subscription-watch" }),
      "msg-1",
      "2026-05-10T12:00:01.000Z",
    );

    expect(result.events).toEqual([]);
    expect(mockChannelMessageGet).not.toHaveBeenCalled();
  });

  it("propagates non-404 hydration errors so the route returns 500 → Microsoft retries", async () => {
    mockChannelMessageGet.mockRejectedValueOnce(new Error("HTTP 500"));

    await expect(
      pull(trigger(validConfig), "msg-1", "2026-05-10T12:00:01.000Z"),
    ).rejects.toThrow(/500/);
  });

  it("threads accountId from integration into refreshAndRetry", async () => {
    mockChannelMessageGet.mockResolvedValueOnce({ id: "msg-1" });

    await pull(trigger(validConfig), "msg-1", "2026-05-10T12:00:01.000Z");

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe(
      "microsoft-teams",
    );
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
  mockGetActiveForExecution.mockResolvedValue({
    userId: "user-1",
    providerAccountId: "alice@contoso.com",
  });
});

function trigger(config: Record<string, unknown>) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "microsoft-teams",
    eventType: "new_channel_message",
    nodeId: "n-1",
    config,
    providerAccountId: null,
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("Teams new_channel_message renew handler", () => {
  it("canHandle: matches microsoft-teams + new_channel_message + subscription-watch", () => {
    expect(
      teamsNewChannelMessageSubscriptionHandler.canHandle(
        trigger({ type: "subscription-watch" }),
      ),
    ).toBe(true);
  });

  it("canHandle: rejects other providers", () => {
    expect(
      teamsNewChannelMessageSubscriptionHandler.canHandle({
        ...trigger({ type: "subscription-watch" }),
        provider: "microsoft-onedrive",
      }),
    ).toBe(false);
  });

  it("canHandle: rejects other event types", () => {
    expect(
      teamsNewChannelMessageSubscriptionHandler.canHandle({
        ...trigger({ type: "subscription-watch" }),
        eventType: "new_email",
      }),
    ).toBe(false);
  });

  it("canHandle: rejects non-subscription-watch configs", () => {
    expect(
      teamsNewChannelMessageSubscriptionHandler.canHandle(
        trigger({ type: "polling" }),
      ),
    ).toBe(false);
  });

  it("getRenewalThresholdMs returns 1h (matches Microsoft sibling cadence)", () => {
    expect(
      teamsNewChannelMessageSubscriptionHandler.getRenewalThresholdMs(),
    ).toBe(60 * 60 * 1000);
  });

  it("renews subscription via refreshAndRetry + shared renewSubscription wrapper", async () => {
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    await teamsNewChannelMessageSubscriptionHandler.renew({
      trigger: trigger({
        type: "subscription-watch",
        subscriptionId: "sub-1",
        clientState: "abc",
        resource: "/teams/team-1/channels/ch-1/messages",
        changeType: "created",
        teamId: "team-1",
        channelId: "ch-1",
      }),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe(
      "microsoft-teams",
    );
    expect(mockRenewSubscription).toHaveBeenCalledTimes(1);
    expect(mockRenewSubscription.mock.calls[0]![0].subscriptionId).toBe(
      "sub-1",
    );
  });

  it("persists Graph's authoritative expiresAt + preserves other config fields", async () => {
    mockRenewSubscription.mockResolvedValueOnce({
      id: "sub-1",
      expirationDateTime: "2026-05-15T00:00:00.000Z",
    });

    const original = {
      type: "subscription-watch",
      subscriptionId: "sub-1",
      clientState: "preserved-state",
      resource: "/teams/team-1/channels/ch-1/messages",
      changeType: "created",
      teamId: "team-1",
      channelId: "ch-1",
      webhookEnabled: true,
      expiresAt: "OLD",
    };
    await teamsNewChannelMessageSubscriptionHandler.renew({
      trigger: trigger(original),
    });

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [updatedId, updated] = mockUpdateConfig.mock.calls[0]!;
    expect(updatedId).toBe("tr-1");
    expect(updated).toEqual({
      ...original,
      expiresAt: "2026-05-15T00:00:00.000Z",
    });
  });

  it("throws when subscriptionId is missing in config", async () => {
    await expect(
      teamsNewChannelMessageSubscriptionHandler.renew({
        trigger: trigger({ type: "subscription-watch" }),
      }),
    ).rejects.toThrow(/missing subscriptionId/);
  });

  it("throws when integration row is gone", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);

    await expect(
      teamsNewChannelMessageSubscriptionHandler.renew({
        trigger: trigger({
          type: "subscription-watch",
          subscriptionId: "sub-1",
        }),
      }),
    ).rejects.toThrow(/no active integration/);
  });
});

});
