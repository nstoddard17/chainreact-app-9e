/**
 * @jest-environment node
 *
 * microsoft-teams:list_channel_messages — read-only, metadata-only.
 *
 * Rules: forwards teamId/channelId/top; defaults top to 20; caps at 50;
 * projects HEADER-LEVEL fields only and NEVER exposes body / subject /
 * summary / sender displayName / attachments / reactions even when Graph
 * returns them; strict schema rejects missing fields; 401 propagation.
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockMessagesList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-teams/api/channelMessagesList", () => ({
  channelMessagesList: (...args: unknown[]) => mockMessagesList(...args),
}));

import { listChannelMessages } from "@/integrations/microsoft-teams/actions/listChannelMessages";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockMessagesList.mockReset();
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

describe("list_channel_messages action", () => {
  it("projects header-level metadata only — body/subject/displayName NEVER exposed", async () => {
    mockMessagesList.mockResolvedValueOnce({
      messages: [
        {
          id: "m1",
          createdDateTime: "2026-05-09T12:00:00Z",
          lastModifiedDateTime: "2026-05-09T12:05:00Z",
          importance: "normal",
          messageType: "message",
          // All of the following are SENSITIVE and must NOT reach output:
          subject: "Secret subject",
          summary: "secret summary",
          body: { contentType: "html", content: "<p>SECRET BODY</p>" },
          from: { user: { id: "user-guid-1", displayName: "Ada Lovelace" } },
          attachments: [{ id: "att-1" }],
          webUrl: "https://teams/m1",
        },
      ],
      nextLink: null,
    });

    const result = await listChannelMessages(input({ teamId: "t1", channelId: "c1", top: 10 }));

    expect(mockMessagesList.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ teamId: "t1", channelId: "c1", top: 10 }),
    );
    expect(result.output.messages).toEqual([
      {
        id: "m1",
        createdDateTime: "2026-05-09T12:00:00Z",
        lastModifiedDateTime: "2026-05-09T12:05:00Z",
        importance: "normal",
        messageType: "message",
        fromUserId: "user-guid-1",
        webUrl: "https://teams/m1",
      },
    ]);
    const serialized = JSON.stringify(result.output);
    expect(serialized).not.toContain("SECRET BODY");
    expect(serialized).not.toContain("Secret subject");
    expect(serialized).not.toContain("secret summary");
    expect(serialized).not.toContain("Ada Lovelace");
    expect(serialized).not.toContain("att-1");
    expect(result.output.count).toBe(1);
  });

  it("defaults top to 20 when omitted", async () => {
    mockMessagesList.mockResolvedValueOnce({ messages: [], nextLink: null });
    await listChannelMessages(input({ teamId: "t1", channelId: "c1" }));
    expect(mockMessagesList.mock.calls[0]![0].top).toBe(20);
  });

  it("rejects top > 50 and missing required fields before any call", async () => {
    await expect(listChannelMessages(input({ teamId: "t1", channelId: "c1", top: 51 }))).rejects.toThrow();
    await expect(listChannelMessages(input({ teamId: "t1" }))).rejects.toThrow();
    expect(mockMessagesList).not.toHaveBeenCalled();
  });

  it("propagates a provider 401", async () => {
    mockRefreshAndRetry.mockReset();
    mockRefreshAndRetry.mockRejectedValue(
      new Error("Microsoft Graph teams/channels/messages list GET returned HTTP 401"),
    );
    await expect(listChannelMessages(input({ teamId: "t1", channelId: "c1" }))).rejects.toThrow(/401/);
  });
});
