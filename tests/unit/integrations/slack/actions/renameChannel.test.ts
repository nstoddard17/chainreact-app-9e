/**
 * @jest-environment node
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));
const mockConversationsRename = jest.fn();
jest.mock("@/integrations/slack/api/conversationsRename", () => ({
  conversationsRename: (...args: unknown[]) => mockConversationsRename(...args),
}));
const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { renameChannel } from "@/integrations/slack/actions/channels/renameChannel";
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
  mockConversationsRename.mockReset();
  mockDecryptToken.mockReset();
});

describe("renameChannel", () => {
  it("calls conversations.rename and returns the channel + id/name flat fields", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsRename.mockResolvedValueOnce({
      channel: { id: "C1", name: "renamed" },
    });

    const result = await renameChannel(
      makeInput({ channel: "C1", name: "renamed" }),
    );
    expect(mockConversationsRename).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
      name: "renamed",
    });
    expect(result.output).toEqual({
      channel: { id: "C1", name: "renamed" },
      id: "C1",
      name: "renamed",
    });
  });

  it("rejects an empty name", async () => {
    await expect(
      renameChannel(makeInput({ channel: "C1", name: "" })),
    ).rejects.toThrow();
  });

  it("rejects a name over 80 chars", async () => {
    await expect(
      renameChannel(makeInput({ channel: "C1", name: "x".repeat(81) })),
    ).rejects.toThrow();
  });

  it("rejects unknown keys (strict)", async () => {
    await expect(
      renameChannel(makeInput({ channel: "C1", name: "n", extra: 1 })),
    ).rejects.toThrow();
  });
});
