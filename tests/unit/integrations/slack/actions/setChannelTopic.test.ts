/**
 * @jest-environment node
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));
const mockConversationsSetTopic = jest.fn();
jest.mock("@/integrations/slack/api/conversationsSetTopic", () => ({
  conversationsSetTopic: (...args: unknown[]) => mockConversationsSetTopic(...args),
}));
const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { setChannelTopic } from "@/integrations/slack/actions/channels/setChannelTopic";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const slackEvent: TriggerEvent = {
  provider: "slack",
  eventType: "slack.message.channel",
  eventId: "Ev1",
  occurredAt: "2026-05-11T00:00:00Z",
  accountId: "T0001",
  payload: {},
};
const baseIntegration = {
  id: "int-1",
  userId: "user-1",
  provider: "slack",
  providerAccountId: "T0001",
  displayName: "Acme",
  accessTokenEncrypted: "ENC",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-11T00:00:00Z",
  updatedAt: "2026-05-11T00:00:00Z",
};
function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf",
    userId: "user-1",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockConversationsSetTopic.mockReset();
  mockDecryptToken.mockReset();
});

describe("setChannelTopic", () => {
  it("calls conversations.setTopic and returns the channel + flat topic field from Slack's response", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsSetTopic.mockResolvedValueOnce({
      channel: { id: "C1", topic: { value: "Topic stored by Slack" } },
    });

    const result = await setChannelTopic(
      makeInput({ channel: "C1", topic: "New topic" }),
    );
    expect(mockConversationsSetTopic).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
      topic: "New topic",
    });
    expect(result.output).toEqual({
      channel: { id: "C1", topic: { value: "Topic stored by Slack" } },
      topic: "Topic stored by Slack",
    });
  });

  it("falls back to the caller's topic string when Slack returns no topic.value", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsSetTopic.mockResolvedValueOnce({
      channel: { id: "C1", topic: {} },
    });
    const result = await setChannelTopic(
      makeInput({ channel: "C1", topic: "Original" }),
    );
    expect(result.output.topic).toBe("Original");
  });

  it("accepts an empty topic (clear-topic semantics)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsSetTopic.mockResolvedValueOnce({
      channel: { id: "C1", topic: { value: "" } },
    });
    await setChannelTopic(makeInput({ channel: "C1", topic: "" }));
    expect(mockConversationsSetTopic).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "" }),
    );
  });

  it("rejects a topic longer than 250 chars", async () => {
    await expect(
      setChannelTopic(
        makeInput({ channel: "C1", topic: "x".repeat(251) }),
      ),
    ).rejects.toThrow();
  });

  it("rejects unknown keys (strict)", async () => {
    await expect(
      setChannelTopic(
        makeInput({ channel: "C1", topic: "t", extra: 1 }),
      ),
    ).rejects.toThrow();
  });
});
