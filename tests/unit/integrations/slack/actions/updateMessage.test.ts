/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/updateMessage.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockChatUpdate = jest.fn();
jest.mock("@/integrations/slack/api/chatUpdate", () => ({
  chatUpdate: (...args: unknown[]) => mockChatUpdate(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { updateMessage } from "@/integrations/slack/actions/updateMessage";
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
    nodeId: "n3",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockChatUpdate.mockReset();
  mockDecryptToken.mockReset();
});

describe("updateMessage — happy path", () => {
  it("decrypts the bot token, calls chat.update, and returns the updated text", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce(SLACK_TOKEN_PLACEHOLDER);
    mockChatUpdate.mockResolvedValueOnce({
      channel: "C1",
      ts: "1.0",
      text: "edited",
    });

    const result = await updateMessage(
      makeInput({ channel: "C1", ts: "1.0", text: "edited" }),
    );

    expect(mockChatUpdate).toHaveBeenCalledWith({
      botToken: SLACK_TOKEN_PLACEHOLDER,
      channel: "C1",
      ts: "1.0",
      text: "edited",
    });
    expect(result.output).toEqual({ channel: "C1", ts: "1.0", text: "edited" });
  });
});

describe("updateMessage — validation + errors", () => {
  it("rejects missing channel", async () => {
    await expect(updateMessage(makeInput({ ts: "1.0", text: "x" }))).rejects.toThrow();
  });

  it("rejects missing ts", async () => {
    await expect(updateMessage(makeInput({ channel: "C1", text: "x" }))).rejects.toThrow();
  });

  it("rejects empty text", async () => {
    await expect(
      updateMessage(makeInput({ channel: "C1", ts: "1.0", text: "" })),
    ).rejects.toThrow();
  });

  it("throws workspace-specific 'connect Slack' message when no integration exists", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      updateMessage(makeInput({ channel: "C1", ts: "1.0", text: "x" })),
    ).rejects.toThrow(/No active Slack integration found for workspace T0001/);
  });

  it("propagates SlackApiError when Slack returns cant_update_message", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockChatUpdate.mockRejectedValueOnce(new Error("Slack API failed: cant_update_message"));
    await expect(
      updateMessage(makeInput({ channel: "C1", ts: "1.0", text: "x" })),
    ).rejects.toThrow(/cant_update_message/);
  });
});
