/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/sendDirectMessage.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockConversationsOpen = jest.fn();
jest.mock("@/integrations/slack/api/conversationsOpen", () => ({
  conversationsOpen: (...args: unknown[]) => mockConversationsOpen(...args),
}));

const mockChatPostMessage = jest.fn();
jest.mock("@/integrations/slack/api/chatPostMessage", () => ({
  chatPostMessage: (...args: unknown[]) => mockChatPostMessage(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { sendDirectMessage } from "@/integrations/slack/actions/sendDirectMessage";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const slackEvent: TriggerEvent = {
  provider: "slack",
  eventType: "slack.message.channel",
  eventId: "Ev1",
  occurredAt: "2026-05-07T00:00:00Z",
  providerAccountId: "T0001",
  payload: { text: "hi", channel: "C123" },
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
  scopes: ["chat:write", "im:write"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-07T00:00:00Z",
  updatedAt: "2026-05-07T00:00:00Z",
};

function makeInput(
  config: Record<string, unknown>,
  overrides: Partial<ActionHandlerInput> = {},
): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "n2",
    config,
    triggerEvent: slackEvent,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockConversationsOpen.mockReset();
  mockChatPostMessage.mockReset();
  mockDecryptToken.mockReset();
});

describe("sendDirectMessage — happy path", () => {
  it("opens DM via conversations.open, posts via chat.postMessage, returns shaped output", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb-token");
    mockConversationsOpen.mockResolvedValueOnce({ channelId: "D-DM-1" });
    mockChatPostMessage.mockResolvedValueOnce({
      channel: "D-DM-1",
      ts: "1.0",
      message: { text: "hi", user: "U_BOT" },
    });

    const result = await sendDirectMessage(
      makeInput({ userId: "U1RECIPIENT", text: "hi there" }),
    );

    expect(mockGetActiveForExecution).toHaveBeenCalledWith("user-1", "slack", "T0001");
    expect(mockDecryptToken).toHaveBeenCalledWith("ENCRYPTED_TOKEN");
    expect(mockConversationsOpen).toHaveBeenCalledWith({
      botToken: "xoxb-token",
      users: "U1RECIPIENT",
    });
    expect(mockChatPostMessage).toHaveBeenCalledWith({
      botToken: "xoxb-token",
      channel: "D-DM-1",
      text: "hi there",
      threadTs: undefined,
    });
    expect(result.output).toEqual({
      channel: "D-DM-1",
      ts: "1.0",
      userId: "U1RECIPIENT",
      message: { text: "hi", user: "U_BOT" },
    });
  });

  it("passes thread_ts through when provided (thread reply within DM)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb-token");
    mockConversationsOpen.mockResolvedValueOnce({ channelId: "D1" });
    mockChatPostMessage.mockResolvedValueOnce({
      channel: "D1",
      ts: "2.0",
      message: {},
    });

    await sendDirectMessage(
      makeInput({ userId: "U1ABC", text: "reply", threadTs: "1.0" }),
    );

    expect(mockChatPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ threadTs: "1.0" }),
    );
  });
});

describe("sendDirectMessage — config validation (defense-in-depth)", () => {
  it("rejects missing userId", async () => {
    await expect(sendDirectMessage(makeInput({ text: "hi" }))).rejects.toThrow();
    expect(mockGetActiveForExecution).not.toHaveBeenCalled();
  });

  it("rejects userId that doesn't match Slack's U… format", async () => {
    await expect(
      sendDirectMessage(makeInput({ userId: "not-a-slack-id", text: "hi" })),
    ).rejects.toThrow();
  });

  it("rejects empty text", async () => {
    await expect(
      sendDirectMessage(makeInput({ userId: "U1", text: "" })),
    ).rejects.toThrow();
  });
});

describe("sendDirectMessage — integration missing", () => {
  it("throws workspace-specific message when accountId is present", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      sendDirectMessage(makeInput({ userId: "U1", text: "x" })),
    ).rejects.toThrow(/No active Slack integration found for workspace T0001/);
  });

  it("throws generic message when triggerEvent is from a different provider", async () => {
    const otherEvent: TriggerEvent = { ...slackEvent, provider: "gmail", providerAccountId: "g" };
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      sendDirectMessage(
        makeInput({ userId: "U1", text: "x" }, { triggerEvent: otherEvent }),
      ),
    ).rejects.toThrow(/No active Slack integration found for this user/);
  });
});

describe("sendDirectMessage — error propagation", () => {
  it("propagates a user_not_found error from conversations.open", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsOpen.mockRejectedValueOnce(new Error("Slack API failed: user_not_found"));
    await expect(
      sendDirectMessage(makeInput({ userId: "U1", text: "x" })),
    ).rejects.toThrow(/user_not_found/);
    expect(mockChatPostMessage).not.toHaveBeenCalled();
  });
});
