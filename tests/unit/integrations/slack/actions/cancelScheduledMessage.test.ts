/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/cancelScheduledMessage.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockChatDeleteScheduledMessage = jest.fn();
jest.mock("@/integrations/slack/api/chatDeleteScheduledMessage", () => ({
  chatDeleteScheduledMessage: (...args: unknown[]) => mockChatDeleteScheduledMessage(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { cancelScheduledMessage } from "@/integrations/slack/actions/cancelScheduledMessage";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const slackEvent: TriggerEvent = {
  provider: "slack",
  eventType: "slack.message.channel",
  eventId: "Ev1",
  occurredAt: "2026-05-07T00:00:00Z",
  providerAccountId: "T0001",
  payload: {},
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "slack",
  providerAccountId: "T0001",
  displayName: "Acme",
  accessTokenEncrypted: "ENCRYPTED_TOKEN",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["chat:write"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-07T00:00:00Z",
  updatedAt: "2026-05-07T00:00:00Z",
};

function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "n8",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockChatDeleteScheduledMessage.mockReset();
  mockDecryptToken.mockReset();
});

describe("cancelScheduledMessage — happy path", () => {
  it("decrypts the bot token, calls chat.deleteScheduledMessage, returns cancelled=true", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb-real");
    mockChatDeleteScheduledMessage.mockResolvedValueOnce(undefined);

    const result = await cancelScheduledMessage(
      makeInput({ channel: "C1", scheduledMessageId: "Q1234ABCD" }),
    );

    expect(mockChatDeleteScheduledMessage).toHaveBeenCalledWith({
      botToken: "xoxb-real",
      channel: "C1",
      scheduledMessageId: "Q1234ABCD",
    });
    expect(result.output).toEqual({
      channel: "C1",
      scheduledMessageId: "Q1234ABCD",
      cancelled: true,
    });
  });
});

describe("cancelScheduledMessage — validation + errors", () => {
  it("rejects missing channel", async () => {
    await expect(
      cancelScheduledMessage(makeInput({ scheduledMessageId: "Q1" })),
    ).rejects.toThrow();
  });

  it("rejects missing scheduledMessageId", async () => {
    await expect(
      cancelScheduledMessage(makeInput({ channel: "C1" })),
    ).rejects.toThrow();
  });

  it("propagates SlackApiError on invalid_scheduled_message_id", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockChatDeleteScheduledMessage.mockRejectedValueOnce(
      new Error("Slack API failed: invalid_scheduled_message_id"),
    );
    await expect(
      cancelScheduledMessage(makeInput({ channel: "C1", scheduledMessageId: "Q1" })),
    ).rejects.toThrow(/invalid_scheduled_message_id/);
  });

  it("throws workspace-specific 'connect Slack' when no integration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      cancelScheduledMessage(makeInput({ channel: "C1", scheduledMessageId: "Q1" })),
    ).rejects.toThrow(/No active Slack integration found for workspace T0001/);
  });
});
