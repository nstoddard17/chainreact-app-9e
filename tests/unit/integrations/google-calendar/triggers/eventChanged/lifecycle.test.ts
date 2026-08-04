/**
 * @jest-environment node
 *
 * google-calendar/triggers/eventChanged trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockEventsList = jest.fn();
const mockEventsWatch = jest.fn();
const mockBuildChannelToken = jest.fn();
const mockChannelsStop = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-calendar/api/eventsList", () => ({
  eventsList: (...args: unknown[]) => mockEventsList(...args),
}));

jest.mock("@/integrations/google-calendar/api/eventsWatch", () => ({
  eventsWatch: (...args: unknown[]) => mockEventsWatch(...args),
}));

jest.mock("@/integrations/_shared/google/channelToken", () => ({
  buildChannelToken: (...args: unknown[]) => mockBuildChannelToken(...args),
}));

jest.mock("@/integrations/google-calendar/api/channelsStop", () => ({
  channelsStop: (...args: unknown[]) => mockChannelsStop(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { activate } from "@/integrations/google-calendar/triggers/eventChanged/activate";
import { NotFoundError, SyncTokenExpiredError } from "@/integrations/google-calendar/api/errors";
import { deactivate } from "@/integrations/google-calendar/triggers/eventChanged/deactivate";
import { classifyChangeKind, normalize } from "@/integrations/google-calendar/triggers/eventChanged/normalize";
import { pull } from "@/integrations/google-calendar/triggers/eventChanged/pull";
import { calendarEventChangedSubscriptionHandler } from "@/integrations/google-calendar/triggers/eventChanged/renew";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockEventsList.mockReset();
  mockEventsWatch.mockReset();
  mockBuildChannelToken.mockReset();
  mockBuildChannelToken.mockReturnValue("hmac-token");
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

const baseNode = {
  id: "node-trigger",
  kind: "trigger" as const,
  provider: "google-calendar",
  type: "event_changed",
  config: { calendarId: "primary" },
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "google-calendar",
  providerAccountId: "alice@example.com",
  displayName: "alice@example.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Calendar event_changed activate", () => {
  it("paginates events.list until nextSyncToken, then calls events.watch", async () => {
    mockEventsList
      .mockResolvedValueOnce({ items: [], nextPageToken: "p1" })
      .mockResolvedValueOnce({ items: [], nextSyncToken: "sync-baseline" });
    mockEventsWatch.mockResolvedValueOnce({
      id: "channel-from-google",
      resourceId: "res-id",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const result = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockEventsList).toHaveBeenCalledTimes(2);
    // Second call should pass the page token from the first response.
    expect(mockEventsList.mock.calls[1]![0].pageToken).toBe("p1");
    expect(mockEventsWatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      calendarId: "primary",
      resourceId: "res-id",
      syncToken: "sync-baseline",
    });
    expect(result.channelId as string).toMatch(/^chainreact-node-trigger-/);
    expect(result.expiresAt).toEqual(expect.any(String));
  });

  it("uses HMAC channel token from buildChannelToken", async () => {
    mockEventsList.mockResolvedValueOnce({
      items: [],
      nextSyncToken: "s",
    });
    mockEventsWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: "1",
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockBuildChannelToken).toHaveBeenCalledTimes(1);
    expect(mockEventsWatch.mock.calls[0]![0].channelToken).toBe("hmac-token");
  });

  it("uses the configured webhook address with NEXT_PUBLIC_APP_URL", async () => {
    mockEventsList.mockResolvedValueOnce({ items: [], nextSyncToken: "s" });
    mockEventsWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: "1",
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockEventsWatch.mock.calls[0]![0].webhookAddress).toBe(
      "https://app.example.test/api/webhooks/google-calendar",
    );
  });

  it("defaults calendarId to 'primary' when node.config doesn't supply one", async () => {
    mockEventsList.mockResolvedValueOnce({ items: [], nextSyncToken: "s" });
    mockEventsWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: "1",
    });

    const node = { ...baseNode, config: {} };
    const result = await activate({ node, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockEventsList.mock.calls[0]![0].calendarId).toBe("primary");
    expect(result.calendarId).toBe("primary");
  });

  it("throws when events.list never produces a syncToken (no pageToken either)", async () => {
    mockEventsList.mockResolvedValueOnce({
      items: [],
      // neither nextPageToken nor nextSyncToken
    });

    await expect(
      activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" }),
    ).rejects.toThrow(/neither nextPageToken nor nextSyncToken/);
    expect(mockEventsWatch).not.toHaveBeenCalled();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former deactivate.test.ts
// ---------------------------------------------------------------------------
describe("deactivate (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockChannelsStop.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "google-calendar",
  eventType: "event_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    channelId: "channel-1",
    resourceId: "res-1",
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
  provider: "google-calendar",
  providerAccountId: "alice@example.com",
  displayName: "alice@example.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Calendar event_changed deactivate", () => {
  it("calls channels.stop with the stored channelId and resourceId", async () => {
    mockChannelsStop.mockResolvedValueOnce(undefined);

    await deactivate({ trigger: baseTrigger, integration: baseIntegration });

    expect(mockChannelsStop).toHaveBeenCalledTimes(1);
    expect(mockChannelsStop.mock.calls[0]![0]).toEqual({
      accessToken: "tok",
      channelId: "channel-1",
      resourceId: "res-1",
    });
  });

  it("swallows NotFoundError (channel already stopped)", async () => {
    mockChannelsStop.mockRejectedValueOnce(new NotFoundError("channel channel-1"));

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).resolves.toBeUndefined();
  });

  it("propagates non-404 errors so lifecycle.ts can log them", async () => {
    mockChannelsStop.mockRejectedValueOnce(new Error("HTTP 503"));

    await expect(
      deactivate({ trigger: baseTrigger, integration: baseIntegration }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("is a no-op when config.type is not subscription-watch", async () => {
    const t = { ...baseTrigger, config: { ...baseTrigger.config, type: "something-else" } };
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockChannelsStop).not.toHaveBeenCalled();
  });

  it("is a no-op when channelId or resourceId is missing", async () => {
    const t = { ...baseTrigger, config: { type: "subscription-watch" } };
    await deactivate({ trigger: t, integration: baseIntegration });
    expect(mockChannelsStop).not.toHaveBeenCalled();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

describe("classifyChangeKind", () => {
  it("classifies status='cancelled' as cancelled regardless of timestamps", () => {
    expect(
      classifyChangeKind({
        id: "e1",
        status: "cancelled",
        created: "2026-05-08T10:00:00Z",
        updated: "2026-05-08T10:00:00Z",
      } as unknown as Parameters<typeof classifyChangeKind>[0]),
    ).toBe("cancelled");
  });

  it("classifies created==updated as 'created' (heuristic)", () => {
    expect(
      classifyChangeKind({
        id: "e1",
        status: "confirmed",
        created: "2026-05-08T10:00:00Z",
        updated: "2026-05-08T10:00:00Z",
      } as unknown as Parameters<typeof classifyChangeKind>[0]),
    ).toBe("created");
  });

  it("classifies the live Google ms-quirk (created second-truncated, updated with ms) as 'created'", () => {
    // Live Google stamps created "…:08.000Z" but updated "…:08.740Z" at
    // insert — second-granularity compare must still detect the create
    // (live-proven by the trigger smoke, 2026-07-07).
    expect(
      classifyChangeKind({
        id: "e1",
        status: "confirmed",
        created: "2026-07-07T12:24:08.000Z",
        updated: "2026-07-07T12:24:08.740Z",
      } as unknown as Parameters<typeof classifyChangeKind>[0]),
    ).toBe("created");
  });

  it("classifies created<updated as 'updated'", () => {
    expect(
      classifyChangeKind({
        id: "e1",
        status: "confirmed",
        created: "2026-05-08T10:00:00Z",
        updated: "2026-05-08T10:30:00Z",
      } as unknown as Parameters<typeof classifyChangeKind>[0]),
    ).toBe("updated");
  });

  it("classifies missing timestamps as 'updated' (fallback)", () => {
    expect(
      classifyChangeKind({
        id: "e1",
        status: "confirmed",
      } as unknown as Parameters<typeof classifyChangeKind>[0]),
    ).toBe("updated");
  });
});

describe("normalize", () => {
  it("builds a TriggerEvent with combined eventId for dedup", () => {
    const event = normalize(
      {
        id: "evt-1",
        summary: "Standup",
        status: "confirmed",
        updated: "2026-05-08T10:30:00Z",
      } as unknown as Parameters<typeof normalize>[0],
      { providerAccountId: "alice@example.com", calendarId: "primary" },
    );
    expect(event.provider).toBe("google-calendar");
    expect(event.eventType).toBe("event_changed");
    expect(event.providerAccountId).toBe("alice@example.com");
    // dedup key combines eventId + updated so a real edit produces fresh dedup
    expect(event.eventId).toBe("evt-1:2026-05-08T10:30:00Z");
    expect(event.occurredAt).toBe("2026-05-08T10:30:00Z");
  });

  it("payload includes changeKind, calendarId, eventId, summary, attendees", () => {
    const event = normalize(
      {
        id: "evt-2",
        summary: "Demo",
        location: "Zoom",
        status: "confirmed",
        updated: "2026-05-08T11:00:00Z",
        created: "2026-05-08T11:00:00Z",
        attendees: [{ email: "a@x.com" }],
        htmlLink: "https://...",
      } as unknown as Parameters<typeof normalize>[0],
      { providerAccountId: "u@x.com", calendarId: "primary" },
    );
    expect(event.payload).toMatchObject({
      changeKind: "created", // created==updated
      calendarId: "primary",
      eventId: "evt-2",
      summary: "Demo",
      location: "Zoom",
      attendees: [{ email: "a@x.com" }],
      htmlLink: "https://...",
      status: "confirmed",
      updated: "2026-05-08T11:00:00Z",
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
  mockEventsList.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockGetActiveForExecution.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    provider: "google-calendar",
    providerAccountId: "alice@example.com",
  });
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "google-calendar",
  eventType: "event_changed",
  nodeId: "n1",
  config: {
    type: "subscription-watch",
    calendarId: "primary",
    syncToken: "sync-1",
    channelId: "channel-1",
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("pull", () => {
  it("fetches the delta with stored syncToken and returns normalized events", async () => {
    mockEventsList.mockResolvedValueOnce({
      items: [
        {
          id: "evt-1",
          summary: "New event",
          status: "confirmed",
          updated: "2026-05-08T10:00:00Z",
          created: "2026-05-08T10:00:00Z",
        },
      ],
      nextSyncToken: "sync-2",
    });

    const result = await pull(baseTrigger);

    expect(mockEventsList.mock.calls[0]![0].syncToken).toBe("sync-1");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.eventType).toBe("event_changed");
    expect((result.events[0]!.payload as Record<string, unknown>).changeKind).toBe("created");
    expect(result.resyncRequired).toBe(false);

    // Persists the new syncToken
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig.mock.calls[0]![1]).toMatchObject({
      syncToken: "sync-2",
    });
  });

  it("paginates via nextPageToken until nextSyncToken arrives", async () => {
    mockEventsList
      .mockResolvedValueOnce({
        items: [{ id: "e1", status: "confirmed", updated: "t1", created: "t1" }],
        nextPageToken: "page-2",
      })
      .mockResolvedValueOnce({
        items: [{ id: "e2", status: "confirmed", updated: "t2", created: "t2" }],
        nextSyncToken: "sync-final",
      });

    const result = await pull(baseTrigger);

    expect(mockEventsList).toHaveBeenCalledTimes(2);
    // Second call uses pageToken instead of syncToken (mutually exclusive).
    expect(mockEventsList.mock.calls[1]![0].pageToken).toBe("page-2");
    expect(mockEventsList.mock.calls[1]![0].syncToken).toBeUndefined();
    expect(result.events).toHaveLength(2);
  });

  it("re-baselines on SyncTokenExpiredError and returns zero events for this notification", async () => {
    // First call (delta fetch) raises 410 → SyncTokenExpiredError.
    // Subsequent calls re-baseline; the last page returns nextSyncToken.
    mockEventsList
      .mockRejectedValueOnce(new SyncTokenExpiredError())
      .mockResolvedValueOnce({
        items: [],
        nextSyncToken: "sync-rebaselined",
      });

    const result = await pull(baseTrigger);

    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(true);
    // Persists new baseline syncToken
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig.mock.calls[0]![1]).toMatchObject({
      syncToken: "sync-rebaselined",
    });
  });

  it("returns resyncRequired when config.syncToken is missing", async () => {
    const trigger = {
      ...baseTrigger,
      config: { type: "subscription-watch", calendarId: "primary" },
    };

    const result = await pull(trigger);

    expect(result.events).toEqual([]);
    expect(result.resyncRequired).toBe(true);
    expect(mockEventsList).not.toHaveBeenCalled();
  });

  it("does not persist when nextSyncToken hasn't advanced", async () => {
    mockEventsList.mockResolvedValueOnce({
      items: [],
      nextSyncToken: "sync-1", // unchanged
    });

    await pull(baseTrigger);

    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former renew.test.ts
// ---------------------------------------------------------------------------
describe("renew (lifecycle)", () => {

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockEventsWatch.mockReset();
  mockChannelsStop.mockReset();
  mockBuildChannelToken.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();

  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockBuildChannelToken.mockReturnValue("hmac-new");
  mockGetActiveForExecution.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    provider: "google-calendar",
    providerAccountId: "alice@example.com",
  });
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

const baseTrigger = {
  id: "tr-1",
  workflowId: "wf-1",
  workflowAccountId: "acct-1",
  userId: "user-1",
  provider: "google-calendar",
  eventType: "event_changed",
  nodeId: "node-trigger",
  config: {
    type: "subscription-watch",
    calendarId: "primary",
    channelId: "channel-old",
    resourceId: "res-old",
    syncToken: "sync-keep",
    expiresAt: "2026-05-15T00:00:00Z",
  },
  providerAccountId: null,
  registeredAt: "",
  expiresAt: null,
  lastRenewedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("calendarEventChangedSubscriptionHandler", () => {
  it("canHandle accepts a Calendar event_changed subscription-watch row", () => {
    expect(
      calendarEventChangedSubscriptionHandler.canHandle(baseTrigger),
    ).toBe(true);
  });

  it("canHandle rejects rows from other providers", () => {
    expect(
      calendarEventChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        provider: "gmail",
      }),
    ).toBe(false);
  });

  it("canHandle rejects subscription-watch rows of different eventType", () => {
    expect(
      calendarEventChangedSubscriptionHandler.canHandle({
        ...baseTrigger,
        eventType: "other_type",
      }),
    ).toBe(false);
  });

  it("getRenewalThresholdMs returns 24h", () => {
    expect(calendarEventChangedSubscriptionHandler.getRenewalThresholdMs()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it("renew creates new channel, stops old, persists with syncToken untouched", async () => {
    mockEventsWatch.mockResolvedValueOnce({
      id: "channel-new",
      resourceId: "res-new",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockChannelsStop.mockResolvedValueOnce(undefined);

    await calendarEventChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    // Watch first
    expect(mockEventsWatch).toHaveBeenCalledTimes(1);
    expect(mockEventsWatch.mock.calls[0]![0].channelToken).toBe("hmac-new");
    expect(mockEventsWatch.mock.calls[0]![0].calendarId).toBe("primary");

    // Then stop old
    expect(mockChannelsStop).toHaveBeenCalledTimes(1);
    expect(mockChannelsStop.mock.calls[0]![0]).toEqual({
      accessToken: "tok",
      channelId: "channel-old",
      resourceId: "res-old",
    });

    // Persist: syncToken unchanged, channelId rotated, expiresAt updated
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [id, persisted] = mockUpdateConfig.mock.calls[0]!;
    expect(id).toBe("tr-1");
    expect((persisted as Record<string, unknown>).syncToken).toBe("sync-keep");
    expect((persisted as Record<string, unknown>).resourceId).toBe("res-new");
    expect((persisted as Record<string, unknown>).channelId).not.toBe("channel-old");
  });

  it("swallows old-channel NotFoundError and still persists", async () => {
    mockEventsWatch.mockResolvedValueOnce({
      id: "channel-new",
      resourceId: "res-new",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockChannelsStop.mockRejectedValueOnce(new NotFoundError("channel"));

    await calendarEventChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
  });

  it("logs (does not throw) when stopping old channel fails for non-404 reasons", async () => {
    mockEventsWatch.mockResolvedValueOnce({
      id: "channel-new",
      resourceId: "res-new",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    mockChannelsStop.mockRejectedValueOnce(new Error("HTTP 503"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await calendarEventChangedSubscriptionHandler.renew({ trigger: baseTrigger });

    expect(warnSpy).toHaveBeenCalled();
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("throws if no active integration is found", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      calendarEventChangedSubscriptionHandler.renew({ trigger: baseTrigger }),
    ).rejects.toThrow(/no active integration/);
  });
});

});
