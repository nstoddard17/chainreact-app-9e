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

jest.mock("@/integrations/microsoft-teams/api/chatMessageSend", () => ({
  chatMessageSend: (...args: unknown[]) => mockSend(...args),
}));

import { sendChatMessage } from "@/integrations/microsoft-teams/actions/sendChatMessage";

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

describe("send_chat_message action", () => {
  it("normalizes the chatMessage and includes chatId in output", async () => {
    mockSend.mockResolvedValueOnce({
      id: "msg-2",
      createdDateTime: "2026-05-10T12:01:00Z",
      body: { contentType: "html", content: "<p>chat</p>" },
    });

    const result = await sendChatMessage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { chatId: "chat-1", content: "<p>chat</p>" },
      triggerEvent: trigger(),
    });

    expect(result.output).toMatchObject({
      messageId: "msg-2",
      chatId: "chat-1",
      bodyContent: "<p>chat</p>",
      bodyContentType: "html",
    });
  });

  it("defaults contentType to 'html'", async () => {
    mockSend.mockResolvedValueOnce({ id: "m" });

    await sendChatMessage({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { chatId: "chat-1", content: "hi" },
      triggerEvent: trigger(),
    });

    expect(mockSend.mock.calls[0]![0].contentType).toBe("html");
  });

  it("rejects empty chatId", async () => {
    await expect(
      sendChatMessage({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { chatId: "", content: "hi" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown contentType", async () => {
    await expect(
      sendChatMessage({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { chatId: "chat-1", content: "hi", contentType: "rtf" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
