/**
 * @jest-environment node
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));
const mockConversationsKick = jest.fn();
jest.mock("@/integrations/slack/api/conversationsKick", () => ({
  conversationsKick: (...args: unknown[]) => mockConversationsKick(...args),
}));
const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { removeUserFromChannel } from "@/integrations/slack/actions/channels/removeUserFromChannel";
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
  mockConversationsKick.mockReset();
  mockDecryptToken.mockReset();
});

describe("removeUserFromChannel", () => {
  it("calls conversations.kick with channel + user and echoes both in output", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsKick.mockResolvedValueOnce(undefined);

    const result = await removeUserFromChannel(
      makeInput({ channel: "C1", user: "U1" }),
    );
    expect(mockConversationsKick).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
      user: "U1",
    });
    expect(result.output).toEqual({ channel: "C1", user: "U1" });
  });

  it("rejects a non-U-prefixed user id", async () => {
    await expect(
      removeUserFromChannel(makeInput({ channel: "C1", user: "NOTAUSER" })),
    ).rejects.toThrow();
  });

  it("rejects a missing user", async () => {
    await expect(
      removeUserFromChannel(makeInput({ channel: "C1" })),
    ).rejects.toThrow();
  });

  it("rejects unknown keys (strict)", async () => {
    await expect(
      removeUserFromChannel(
        makeInput({ channel: "C1", user: "U1", extra: 1 }),
      ),
    ).rejects.toThrow();
  });

  it("propagates SlackApiError (not_in_channel)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsKick.mockRejectedValueOnce(
      new Error("Slack API failed: not_in_channel"),
    );
    await expect(
      removeUserFromChannel(makeInput({ channel: "C1", user: "U1" })),
    ).rejects.toThrow(/not_in_channel/);
  });
});
