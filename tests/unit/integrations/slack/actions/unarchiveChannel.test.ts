/**
 * @jest-environment node
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));
const mockConversationsUnarchive = jest.fn();
jest.mock("@/integrations/slack/api/conversationsUnarchive", () => ({
  conversationsUnarchive: (...args: unknown[]) => mockConversationsUnarchive(...args),
}));
const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { unarchiveChannel } from "@/integrations/slack/actions/channels/unarchiveChannel";
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
  mockConversationsUnarchive.mockReset();
  mockDecryptToken.mockReset();
});

describe("unarchiveChannel", () => {
  it("calls conversations.unarchive and echoes the channel id", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsUnarchive.mockResolvedValueOnce(undefined);

    const result = await unarchiveChannel(makeInput({ channel: "C1" }));
    expect(mockConversationsUnarchive).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
    });
    expect(result.output).toEqual({ channel: "C1" });
  });

  it("rejects a D-prefixed id (DM, not a channel)", async () => {
    await expect(
      unarchiveChannel(makeInput({ channel: "D1ABC" })),
    ).rejects.toThrow();
  });

  it("rejects unknown keys (strict)", async () => {
    await expect(
      unarchiveChannel(makeInput({ channel: "C1", noSuchField: true })),
    ).rejects.toThrow();
  });

  it("propagates SlackApiError (not_archived)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsUnarchive.mockRejectedValueOnce(
      new Error("Slack API failed: not_archived"),
    );
    await expect(
      unarchiveChannel(makeInput({ channel: "C1" })),
    ).rejects.toThrow(/not_archived/);
  });
});
