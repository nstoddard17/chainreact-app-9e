/**
 * @jest-environment node
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));
const mockConversationsArchive = jest.fn();
jest.mock("@/integrations/slack/api/conversationsArchive", () => ({
  conversationsArchive: (...args: unknown[]) => mockConversationsArchive(...args),
}));
const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { archiveChannel } from "@/integrations/slack/actions/channels/archiveChannel";
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
  mockConversationsArchive.mockReset();
  mockDecryptToken.mockReset();
});

describe("archiveChannel", () => {
  it("calls conversations.archive and echoes the channel id in the output", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsArchive.mockResolvedValueOnce(undefined);

    const result = await archiveChannel(makeInput({ channel: "C1" }));
    expect(mockConversationsArchive).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
    });
    expect(result.output).toEqual({ channel: "C1" });
  });

  it("accepts a legacy G-prefixed private channel id", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsArchive.mockResolvedValueOnce(undefined);
    await archiveChannel(makeInput({ channel: "GLEGACY1" }));
    expect(mockConversationsArchive).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "GLEGACY1" }),
    );
  });

  it("rejects a missing channel", async () => {
    await expect(archiveChannel(makeInput({}))).rejects.toThrow();
  });

  it("rejects a D-prefixed DM id (not a channel)", async () => {
    await expect(
      archiveChannel(makeInput({ channel: "D1ABC" })),
    ).rejects.toThrow();
  });

  it("rejects unknown keys (strict)", async () => {
    await expect(
      archiveChannel(makeInput({ channel: "C1", noSuchField: true })),
    ).rejects.toThrow();
  });

  it("propagates SlackApiError", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsArchive.mockRejectedValueOnce(
      new Error("Slack API failed: already_archived"),
    );
    await expect(archiveChannel(makeInput({ channel: "C1" }))).rejects.toThrow(
      /already_archived/,
    );
  });

  it("throws when no Slack integration is active", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(archiveChannel(makeInput({ channel: "C1" }))).rejects.toThrow(
      /No active Slack integration/,
    );
  });
});
