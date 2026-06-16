/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/listScheduledMessages.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockChatScheduledMessagesList = jest.fn();
jest.mock("@/integrations/slack/api/chatScheduledMessagesList", () => ({
  chatScheduledMessagesList: (...args: unknown[]) => mockChatScheduledMessagesList(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { SLACK_TOKEN_PLACEHOLDER } from "@/tests/helpers/syntheticSecrets";
import { listScheduledMessages } from "@/integrations/slack/actions/listScheduledMessages";
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

function makeInput(config: Record<string, unknown> = {}): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "n9",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockChatScheduledMessagesList.mockReset();
  mockDecryptToken.mockReset();
});

describe("listScheduledMessages — happy path", () => {
  it("calls chat.scheduledMessages.list with no params and returns the count + pagination metadata", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce(SLACK_TOKEN_PLACEHOLDER);
    mockChatScheduledMessagesList.mockResolvedValueOnce({
      messages: [
        { id: "Q1", channel_id: "C1", post_at: 1730000000, date_created: 1729000000, text: "a" },
        { id: "Q2", channel_id: "C2", post_at: 1731000000, date_created: 1729000000, text: "b" },
      ],
      hasMore: false,
      nextCursor: null,
    });

    const result = await listScheduledMessages(makeInput());

    expect(mockChatScheduledMessagesList).toHaveBeenCalledWith({
      botToken: SLACK_TOKEN_PLACEHOLDER,
      channel: undefined,
      limit: undefined,
      oldest: undefined,
      latest: undefined,
      cursor: undefined,
    });
    expect(result.output).toEqual({
      messages: [
        { id: "Q1", channel_id: "C1", post_at: 1730000000, date_created: 1729000000, text: "a" },
        { id: "Q2", channel_id: "C2", post_at: 1731000000, date_created: 1729000000, text: "b" },
      ],
      count: 2,
      hasMore: false,
      nextCursor: null,
    });
  });

  it("forwards channel + pagination params when provided", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockChatScheduledMessagesList.mockResolvedValueOnce({
      messages: [],
      hasMore: true,
      nextCursor: "cursor-next",
    });

    const result = await listScheduledMessages(
      makeInput({
        channel: "C1",
        limit: 50,
        oldest: "1.0",
        latest: "2.0",
        cursor: "prev-cursor",
      }),
    );

    expect(mockChatScheduledMessagesList).toHaveBeenCalledWith({
      botToken: "xoxb",
      channel: "C1",
      limit: 50,
      oldest: "1.0",
      latest: "2.0",
      cursor: "prev-cursor",
    });
    expect(result.output).toEqual({
      messages: [],
      count: 0,
      hasMore: true,
      nextCursor: "cursor-next",
    });
  });
});

describe("listScheduledMessages — validation + errors", () => {
  it("rejects limit out of range", async () => {
    await expect(listScheduledMessages(makeInput({ limit: 5000 }))).rejects.toThrow();
  });

  it("rejects empty cursor (must be undefined or non-empty)", async () => {
    await expect(listScheduledMessages(makeInput({ cursor: "" }))).rejects.toThrow();
  });

  it("propagates SlackApiError on invalid_cursor", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockChatScheduledMessagesList.mockRejectedValueOnce(
      new Error("Slack API failed: invalid_cursor"),
    );
    await expect(
      listScheduledMessages(makeInput({ cursor: "bad-cursor" })),
    ).rejects.toThrow(/invalid_cursor/);
  });
});
