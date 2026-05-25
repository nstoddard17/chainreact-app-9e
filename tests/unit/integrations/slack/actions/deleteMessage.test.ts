/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/deleteMessage.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockChatDelete = jest.fn();
jest.mock("@/integrations/slack/api/chatDelete", () => ({
  chatDelete: (...args: unknown[]) => mockChatDelete(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { deleteMessage } from "@/integrations/slack/actions/deleteMessage";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const slackEvent: TriggerEvent = {
  provider: "slack",
  eventType: "slack.message.channel",
  eventId: "Ev1",
  occurredAt: "2026-05-07T00:00:00Z",
  accountId: "T0001",
  payload: {},
};

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
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
    runId: "run-1",
    nodeId: "n4",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockChatDelete.mockReset();
  mockDecryptToken.mockReset();
});

describe("deleteMessage — happy path", () => {
  it("decrypts the bot token, calls chat.delete, and returns the channel + ts confirmation", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb-real");
    mockChatDelete.mockResolvedValueOnce({ channel: "C1", ts: "1.0" });

    const result = await deleteMessage(makeInput({ channel: "C1", ts: "1.0" }));

    expect(mockChatDelete).toHaveBeenCalledWith({
      botToken: "xoxb-real",
      channel: "C1",
      ts: "1.0",
    });
    expect(result.output).toEqual({ channel: "C1", ts: "1.0" });
  });
});

describe("deleteMessage — validation + errors", () => {
  it("rejects missing channel", async () => {
    await expect(deleteMessage(makeInput({ ts: "1.0" }))).rejects.toThrow();
  });

  it("rejects missing ts", async () => {
    await expect(deleteMessage(makeInput({ channel: "C1" }))).rejects.toThrow();
  });

  it("propagates SlackApiError on cant_delete_message", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockChatDelete.mockRejectedValueOnce(new Error("Slack API failed: cant_delete_message"));
    await expect(
      deleteMessage(makeInput({ channel: "C1", ts: "1.0" })),
    ).rejects.toThrow(/cant_delete_message/);
  });
});
