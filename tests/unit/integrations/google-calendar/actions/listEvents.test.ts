/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockEventsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-calendar/api/eventsList", () => ({
  eventsList: (...args: unknown[]) => mockEventsList(...args),
}));

import { listEvents } from "@/integrations/google-calendar/actions/listEvents";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockEventsList.mockReset();
});

function trigger(): TriggerEvent {
  return {
    provider: "google-calendar",
    eventType: "manual",
    eventId: "x",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "alice@example.com",
    payload: {},
  };
}

function input(config: Record<string, unknown> = {}) {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "node-list",
    config,
    triggerEvent: trigger(),
  };
}

describe("listEvents", () => {
  it("forwards config params (timeMin/timeMax/q/orderBy/etc.) to eventsList", async () => {
    mockRefreshAndRetry.mockImplementation(async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"));
    mockEventsList.mockResolvedValueOnce({ items: [] });

    await listEvents(
      input({
        calendarId: "primary",
        timeMin: "2026-01-01T00:00:00Z",
        timeMax: "2026-12-31T23:59:59Z",
        maxResults: 100,
        query: "standup",
        orderBy: "startTime",
        showDeleted: true,
      }),
    );

    const args = mockEventsList.mock.calls[0]![0];
    expect(args.accessToken).toBe("tok");
    expect(args.calendarId).toBe("primary");
    expect(args.timeMin).toBe("2026-01-01T00:00:00Z");
    expect(args.timeMax).toBe("2026-12-31T23:59:59Z");
    expect(args.maxResults).toBe(100);
    expect(args.q).toBe("standup");
    expect(args.orderBy).toBe("startTime");
    expect(args.singleEvents).toBe(true); // schema default
    expect(args.showDeleted).toBe(true);
  });

  it("returns events array + count + first/last ids + sync tokens", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [
        { id: "e1", summary: "First" },
        { id: "e2", summary: "Mid" },
        { id: "e3", summary: "Last" },
      ],
      nextPageToken: "ptok",
      nextSyncToken: "stok",
    });

    const result = await listEvents(input());
    expect(result).toEqual({
      output: {
        events: [
          { id: "e1", summary: "First" },
          { id: "e2", summary: "Mid" },
          { id: "e3", summary: "Last" },
        ],
        count: 3,
        firstEventId: "e1",
        lastEventId: "e3",
        nextPageToken: "ptok",
        nextSyncToken: "stok",
        calendarId: "primary",
        timeMin: null,
        timeMax: null,
      },
    });
  });

  it("returns count=0 with null first/last ids on empty result", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ items: [] });

    const result = await listEvents(input());
    expect((result.output as Record<string, unknown>).count).toBe(0);
    expect((result.output as Record<string, unknown>).firstEventId).toBeNull();
    expect((result.output as Record<string, unknown>).lastEventId).toBeNull();
  });

  it("rejects maxResults > 2500 (Google's hard cap) at the schema layer", async () => {
    await expect(
      listEvents(input({ calendarId: "primary", maxResults: 5000 })),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});
