/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/getMessages.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockConversationsHistory = jest.fn();
jest.mock("@/integrations/slack/api/conversationsHistory", () => ({
  conversationsHistory: (...args: unknown[]) => mockConversationsHistory(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { getMessages } from "@/integrations/slack/actions/getMessages";
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
    nodeId: "n5",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockConversationsHistory.mockReset();
  mockDecryptToken.mockReset();
});

describe("getMessages — happy path", () => {
  it("decrypts the bot token, calls conversations.history, returns messages + pagination metadata", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb-real");
    mockConversationsHistory.mockResolvedValueOnce({
      messages: [
        { ts: "1.0", text: "hello" },
        { ts: "2.0", text: "world" },
      ],
      hasMore: true,
      nextCursor: "cursor-page-2",
    });

    const result = await getMessages(makeInput({ channel: "C1", limit: 50 }));

    expect(mockConversationsHistory).toHaveBeenCalledWith({
      botToken: "xoxb-real",
      channel: "C1",
      limit: 50,
      oldest: undefined,
      latest: undefined,
      cursor: undefined,
    });
    expect(result.output).toEqual({
      messages: [
        { ts: "1.0", text: "hello" },
        { ts: "2.0", text: "world" },
      ],
      count: 2,
      hasMore: true,
      nextCursor: "cursor-page-2",
    });
  });

  it("forwards optional oldest/latest/cursor params", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsHistory.mockResolvedValueOnce({
      messages: [],
      hasMore: false,
      nextCursor: null,
    });

    await getMessages(
      makeInput({
        channel: "C1",
        oldest: "1.0",
        latest: "2.0",
        cursor: "next-cursor",
      }),
    );

    expect(mockConversationsHistory).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
      limit: undefined,
      oldest: "1.0",
      latest: "2.0",
      cursor: "next-cursor",
    });
  });

  it("returns count=0 + nextCursor=null for an empty channel window", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsHistory.mockResolvedValueOnce({
      messages: [],
      hasMore: false,
      nextCursor: null,
    });

    const result = await getMessages(makeInput({ channel: "C1" }));
    expect(result.output).toEqual({
      messages: [],
      count: 0,
      hasMore: false,
      nextCursor: null,
    });
  });
});

describe("getMessages — validation + errors", () => {
  it("rejects missing channel", async () => {
    await expect(getMessages(makeInput({}))).rejects.toThrow();
  });

  it("rejects limit out of range", async () => {
    await expect(
      getMessages(makeInput({ channel: "C1", limit: 5000 })),
    ).rejects.toThrow();
  });

  it("propagates SlackApiError when Slack returns channel_not_found", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsHistory.mockRejectedValueOnce(
      new Error("Slack API failed: channel_not_found"),
    );
    await expect(
      getMessages(makeInput({ channel: "C1" })),
    ).rejects.toThrow(/channel_not_found/);
  });
});
