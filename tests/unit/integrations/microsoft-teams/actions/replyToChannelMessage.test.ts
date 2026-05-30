/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockReply = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-teams/api/channelMessageReply", () => ({
  channelMessageReply: (...args: unknown[]) => mockReply(...args),
}));

import { replyToChannelMessage } from "@/integrations/microsoft-teams/actions/replyToChannelMessage";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockReply.mockReset();
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

describe("reply_to_channel_message action", () => {
  it("posts a reply and surfaces parentMessageId in output", async () => {
    mockReply.mockResolvedValueOnce({
      id: "reply-1",
      replyToId: "parent-1",
      createdDateTime: "2026-05-10T12:05:00Z",
      body: { contentType: "html", content: "<p>reply</p>" },
    });

    const result = await replyToChannelMessage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        teamId: "team-1",
        channelId: "ch-1",
        messageId: "parent-1",
        content: "<p>reply</p>",
      },
      triggerEvent: trigger(),
    });

    expect(result.output).toMatchObject({
      messageId: "reply-1",
      replyToId: "parent-1",
      teamId: "team-1",
      channelId: "ch-1",
      parentMessageId: "parent-1",
      bodyContent: "<p>reply</p>",
    });
  });

  it("defaults contentType to 'html' (normalizes V1's omit-then-text behavior)", async () => {
    mockReply.mockResolvedValueOnce({ id: "r" });

    await replyToChannelMessage({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        teamId: "team-1",
        channelId: "ch-1",
        messageId: "p",
        content: "hi",
      },
      triggerEvent: trigger(),
    });

    expect(mockReply.mock.calls[0]![0].contentType).toBe("html");
  });

  it("rejects missing parent messageId", async () => {
    await expect(
      replyToChannelMessage({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          teamId: "team-1",
          channelId: "ch-1",
          messageId: "",
          content: "hi",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
