/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockSend = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-teams/api/channelMessageSend", () => ({
  channelMessageSend: (...args: unknown[]) => mockSend(...args),
}));

import { sendChannelMessage } from "@/integrations/microsoft-teams/actions/sendChannelMessage";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSend.mockReset();
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
    accountId: "alice@contoso.com",
    payload: {},
  };
}

describe("send_channel_message action", () => {
  it("normalizes the chatMessage and includes teamId + channelId in output", async () => {
    mockSend.mockResolvedValueOnce({
      id: "msg-1",
      createdDateTime: "2026-05-10T12:00:00Z",
      body: { contentType: "html", content: "<p>hi</p>" },
      from: { user: { id: "u-1", displayName: "Alice" } },
      webUrl: "https://teams.microsoft.com/l/...",
    });

    const result = await sendChannelMessage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        teamId: "team-1",
        channelId: "ch-1",
        content: "<p>hi</p>",
      },
      triggerEvent: trigger(),
    });

    expect(result.output).toEqual({
      messageId: "msg-1",
      createdDateTime: "2026-05-10T12:00:00Z",
      lastModifiedDateTime: null,
      replyToId: null,
      subject: null,
      bodyContent: "<p>hi</p>",
      bodyContentType: "html",
      fromUserId: "u-1",
      fromUserDisplayName: "Alice",
      webUrl: "https://teams.microsoft.com/l/...",
      teamId: "team-1",
      channelId: "ch-1",
    });
  });

  it("defaults contentType to 'html' when caller omits it", async () => {
    mockSend.mockResolvedValueOnce({
      id: "m",
      body: { contentType: "html", content: "hi" },
    });

    await sendChannelMessage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { teamId: "team-1", channelId: "ch-1", content: "hi" },
      triggerEvent: trigger(),
    });

    expect(mockSend.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        contentType: "html",
        content: "hi",
      }),
    );
  });

  it("forwards explicit contentType='text' verbatim", async () => {
    mockSend.mockResolvedValueOnce({ id: "m" });

    await sendChannelMessage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        teamId: "team-1",
        channelId: "ch-1",
        content: "plain",
        contentType: "text",
      },
      triggerEvent: trigger(),
    });

    expect(mockSend.mock.calls[0]![0].contentType).toBe("text");
  });

  it("threads accountId from triggerEvent into refreshAndRetry", async () => {
    mockSend.mockResolvedValueOnce({ id: "m" });

    await sendChannelMessage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { teamId: "team-1", channelId: "ch-1", content: "hi" },
      triggerEvent: trigger(),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe(
      "microsoft-teams",
    );
    expect(mockRefreshAndRetry.mock.calls[0]![0].accountId).toBe(
      "alice@contoso.com",
    );
    expect(mockRefreshAndRetry.mock.calls[0]![0].userId).toBe("u");
  });

  it("passes accountId=null when triggerEvent.provider is a different provider", async () => {
    mockSend.mockResolvedValueOnce({ id: "m" });

    await sendChannelMessage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { teamId: "team-1", channelId: "ch-1", content: "hi" },
      triggerEvent: {
        provider: "gmail",
        eventType: "new_email",
        eventId: "e",
        occurredAt: "2026-05-10T12:00:00Z",
        accountId: "alice@example.test",
        payload: {},
      },
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].accountId).toBeNull();
  });

  it("rejects empty content via Zod (strict schema)", async () => {
    await expect(
      sendChannelMessage({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { teamId: "team-1", channelId: "ch-1", content: "" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown config keys (strict)", async () => {
    await expect(
      sendChannelMessage({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          teamId: "team-1",
          channelId: "ch-1",
          content: "hi",
          extraField: "should fail",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown contentType values (text|html only)", async () => {
    await expect(
      sendChannelMessage({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          teamId: "team-1",
          channelId: "ch-1",
          content: "hi",
          contentType: "markdown",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
