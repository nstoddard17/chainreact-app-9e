/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockEventsList = jest.fn();
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

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { SyncTokenExpiredError } from "@/integrations/google-calendar/api/errors";
import { pull } from "@/integrations/google-calendar/triggers/eventChanged/pull";

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
