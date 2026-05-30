/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockEventsList = jest.fn();
const mockEventsWatch = jest.fn();
const mockBuildChannelToken = jest.fn();

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

import { activate } from "@/integrations/google-calendar/triggers/eventChanged/activate";

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
