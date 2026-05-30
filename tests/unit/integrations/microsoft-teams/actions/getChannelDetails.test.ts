/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-teams/api/channelGet", () => ({
  channelGet: (...args: unknown[]) => mockGet(...args),
}));

import { getChannelDetails } from "@/integrations/microsoft-teams/actions/getChannelDetails";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGet.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-teams",
    eventType: "new_channel_message",
    eventId: "evt-1",
    occurredAt: "2026-05-10T12:00:00Z",
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

describe("get_channel_details action", () => {
  it("returns the normalized channel resource (full payload)", async () => {
    mockGet.mockResolvedValueOnce({
      id: "ch-1",
      displayName: "General",
      description: "The team's main channel",
      email: "general@team.example",
      membershipType: "standard",
      createdDateTime: "2026-01-01T00:00:00Z",
      webUrl: "https://teams.microsoft.com/l/channel/...",
    });

    const result = await getChannelDetails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { teamId: "team-1", channelId: "ch-1" },
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      teamId: "team-1",
      channelId: "ch-1",
      displayName: "General",
      description: "The team's main channel",
      email: "general@team.example",
      membershipType: "standard",
      createdDateTime: "2026-01-01T00:00:00Z",
      webUrl: "https://teams.microsoft.com/l/channel/...",
    });
  });

  it("normalizes missing optional fields to null/empty (stable downstream contract)", async () => {
    mockGet.mockResolvedValueOnce({
      id: "ch-2",
      membershipType: "private",
    });

    const result = await getChannelDetails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { teamId: "team-1", channelId: "ch-2" },
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      teamId: "team-1",
      channelId: "ch-2",
      displayName: "",
      description: null,
      email: null,
      membershipType: "private",
      createdDateTime: null,
      webUrl: null,
    });
  });

  it("threads accountId from triggerEvent into refreshAndRetry", async () => {
    mockGet.mockResolvedValueOnce({ id: "ch-1" });

    await getChannelDetails({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { teamId: "team-1", channelId: "ch-1" },
      triggerEvent: trigger(),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].accountId).toBe(
      "alice@contoso.com",
    );
  });

  it("rejects missing teamId", async () => {
    await expect(
      getChannelDetails({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { teamId: "", channelId: "ch-1" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
