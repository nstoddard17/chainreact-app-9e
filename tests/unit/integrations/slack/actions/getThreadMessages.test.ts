/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/getThreadMessages.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockConversationsReplies = jest.fn();
jest.mock("@/integrations/slack/api/conversationsReplies", () => ({
  conversationsReplies: (...args: unknown[]) => mockConversationsReplies(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { getThreadMessages } from "@/integrations/slack/actions/getThreadMessages";
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
  scopes: ["channels:history"],
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
    nodeId: "n6",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockConversationsReplies.mockReset();
  mockDecryptToken.mockReset();
});

describe("getThreadMessages — happy path", () => {
  it("decrypts the bot token, calls conversations.replies with (channel, ts), returns the thread", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsReplies.mockResolvedValueOnce({
      messages: [
        { ts: "1.0", text: "parent" },
        { ts: "1.1", text: "reply", thread_ts: "1.0" },
      ],
      hasMore: false,
      nextCursor: null,
    });

    const result = await getThreadMessages(
      makeInput({ channel: "C1", threadTs: "1.0" }),
    );

    expect(mockConversationsReplies).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
      ts: "1.0",
      limit: undefined,
      oldest: undefined,
      latest: undefined,
      cursor: undefined,
    });
    expect(result.output).toEqual({
      messages: [
        { ts: "1.0", text: "parent" },
        { ts: "1.1", text: "reply", thread_ts: "1.0" },
      ],
      count: 2,
      hasMore: false,
      nextCursor: null,
    });
  });

  it("forwards optional limit + cursor", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsReplies.mockResolvedValueOnce({
      messages: [],
      hasMore: true,
      nextCursor: "cursor-X",
    });

    await getThreadMessages(
      makeInput({ channel: "C1", threadTs: "1.0", limit: 25, cursor: "prev-cursor" }),
    );

    expect(mockConversationsReplies).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
      ts: "1.0",
      limit: 25,
      oldest: undefined,
      latest: undefined,
      cursor: "prev-cursor",
    });
  });
});

describe("getThreadMessages — validation + errors", () => {
  it("rejects missing threadTs", async () => {
    await expect(getThreadMessages(makeInput({ channel: "C1" }))).rejects.toThrow();
  });

  it("rejects missing channel", async () => {
    await expect(getThreadMessages(makeInput({ threadTs: "1.0" }))).rejects.toThrow();
  });

  it("propagates SlackApiError on thread_not_found", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsReplies.mockRejectedValueOnce(
      new Error("Slack API failed: thread_not_found"),
    );
    await expect(
      getThreadMessages(makeInput({ channel: "C1", threadTs: "1.0" })),
    ).rejects.toThrow(/thread_not_found/);
  });
});
