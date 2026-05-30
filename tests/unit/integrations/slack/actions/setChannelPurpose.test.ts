/**
 * @jest-environment node
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));
const mockConversationsSetPurpose = jest.fn();
jest.mock("@/integrations/slack/api/conversationsSetPurpose", () => ({
  conversationsSetPurpose: (...args: unknown[]) => mockConversationsSetPurpose(...args),
}));
const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { setChannelPurpose } from "@/integrations/slack/actions/channels/setChannelPurpose";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const slackEvent: TriggerEvent = {
  provider: "slack",
  eventType: "slack.message.channel",
  eventId: "Ev1",
  occurredAt: "2026-05-11T00:00:00Z",
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
    accountId: "acct-user-1",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockConversationsSetPurpose.mockReset();
  mockDecryptToken.mockReset();
});

describe("setChannelPurpose", () => {
  it("calls conversations.setPurpose and returns the channel + flat purpose field", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsSetPurpose.mockResolvedValueOnce({
      channel: { id: "C1", purpose: { value: "Purpose stored by Slack" } },
    });

    const result = await setChannelPurpose(
      makeInput({ channel: "C1", purpose: "New purpose" }),
    );
    expect(mockConversationsSetPurpose).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
      purpose: "New purpose",
    });
    expect(result.output).toEqual({
      channel: { id: "C1", purpose: { value: "Purpose stored by Slack" } },
      purpose: "Purpose stored by Slack",
    });
  });

  it("rejects a purpose longer than 250 chars", async () => {
    await expect(
      setChannelPurpose(
        makeInput({ channel: "C1", purpose: "x".repeat(251) }),
      ),
    ).rejects.toThrow();
  });

  it("rejects unknown keys (strict)", async () => {
    await expect(
      setChannelPurpose(
        makeInput({ channel: "C1", purpose: "p", extra: 1 }),
      ),
    ).rejects.toThrow();
  });
});
