/**
 * @jest-environment node
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));
const mockConversationsJoin = jest.fn();
jest.mock("@/integrations/slack/api/conversationsJoin", () => ({
  conversationsJoin: (...args: unknown[]) => mockConversationsJoin(...args),
}));
const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { joinChannel } from "@/integrations/slack/actions/channels/joinChannel";
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
  mockConversationsJoin.mockReset();
  mockDecryptToken.mockReset();
});

describe("joinChannel", () => {
  it("calls conversations.join and returns the channel + flat fields", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsJoin.mockResolvedValueOnce({
      channel: { id: "C1", name: "general" },
    });

    const result = await joinChannel(makeInput({ channel: "C1" }));
    expect(mockConversationsJoin).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
    });
    expect(result.output).toEqual({
      channel: { id: "C1", name: "general" },
      id: "C1",
      name: "general",
    });
  });

  it("rejects a missing channel", async () => {
    await expect(joinChannel(makeInput({}))).rejects.toThrow();
  });

  it("rejects unknown keys (strict)", async () => {
    await expect(
      joinChannel(makeInput({ channel: "C1", extra: 1 })),
    ).rejects.toThrow();
  });

  it("propagates SlackApiError (is_archived)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsJoin.mockRejectedValueOnce(
      new Error("Slack API failed: is_archived"),
    );
    await expect(joinChannel(makeInput({ channel: "C1" }))).rejects.toThrow(
      /is_archived/,
    );
  });
});
