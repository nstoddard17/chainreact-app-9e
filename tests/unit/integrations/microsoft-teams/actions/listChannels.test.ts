/**
 * @jest-environment node
 *
 * microsoft-teams:list_channels — read-only channel list.
 *
 * Rules: forwards teamId to channelsList; bounded projection
 * {id,displayName,description,membershipType} (no channel email); strict
 * schema rejects missing teamId; 401 propagation.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockChannelsList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-teams/api/channelsList", () => ({
  channelsList: (...args: unknown[]) => mockChannelsList(...args),
}));

import { listChannels } from "@/integrations/microsoft-teams/actions/listChannels";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockChannelsList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "microsoft-teams",
    eventType: "new_channel_message",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

function input(config: Record<string, unknown>) {
  return { workflowId: "wf", userId: "u", accountId: "acct-u", runId: "r", nodeId: "n", config, triggerEvent: trigger() };
}

describe("list_channels action", () => {
  it("forwards teamId and projects a bounded channel shape (no email)", async () => {
    mockChannelsList.mockResolvedValueOnce({
      channels: [
        // Hostile email/webUrl must NOT spread into output.
        { id: "c1", displayName: "General", description: "d", membershipType: "standard", email: "c1@x.com", webUrl: "https://x" },
      ],
      nextLink: null,
    });

    const result = await listChannels(input({ teamId: "t1" }));

    expect(mockChannelsList.mock.calls[0]![0]).toEqual(expect.objectContaining({ teamId: "t1" }));
    expect(result.output.channels).toEqual([
      { id: "c1", displayName: "General", description: "d", membershipType: "standard" },
    ]);
    expect(result.output.teamId).toBe("t1");
    expect(result.output.hasMore).toBe(false);
    expect(JSON.stringify(result.output)).not.toContain("c1@x.com");
    expect(JSON.stringify(result.output)).not.toContain("webUrl");
  });

  it("rejects a missing teamId before calling the provider", async () => {
    await expect(listChannels(input({}))).rejects.toThrow();
    expect(mockChannelsList).not.toHaveBeenCalled();
  });

  it("propagates a provider 401", async () => {
    mockRefreshAndRetry.mockReset();
    mockRefreshAndRetry.mockRejectedValue(new Error("Microsoft Graph teams/channels list GET returned HTTP 401"));
    await expect(listChannels(input({ teamId: "t1" }))).rejects.toThrow(/401/);
  });
});
