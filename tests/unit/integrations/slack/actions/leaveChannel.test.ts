/**
 * @jest-environment node
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));
const mockConversationsLeave = jest.fn();
jest.mock("@/integrations/slack/api/conversationsLeave", () => ({
  conversationsLeave: (...args: unknown[]) => mockConversationsLeave(...args),
}));
const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { leaveChannel } from "@/integrations/slack/actions/channels/leaveChannel";
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
  mockConversationsLeave.mockReset();
  mockDecryptToken.mockReset();
});

describe("leaveChannel", () => {
  it("calls conversations.leave and echoes the channel id", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsLeave.mockResolvedValueOnce(undefined);

    const result = await leaveChannel(makeInput({ channel: "C1" }));
    expect(mockConversationsLeave).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
    });
    expect(result.output).toEqual({ channel: "C1" });
  });

  it("rejects unknown keys (strict)", async () => {
    await expect(
      leaveChannel(makeInput({ channel: "C1", extra: 1 })),
    ).rejects.toThrow();
  });

  it("propagates SlackApiError", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsLeave.mockRejectedValueOnce(
      new Error("Slack API failed: cant_leave_general"),
    );
    await expect(leaveChannel(makeInput({ channel: "C1" }))).rejects.toThrow(
      /cant_leave_general/,
    );
  });
});
