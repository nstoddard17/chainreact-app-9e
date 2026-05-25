/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/postInteractiveBlocks.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockChatPostMessage = jest.fn();
jest.mock("@/integrations/slack/api/chatPostMessage", () => ({
  chatPostMessage: (...args: unknown[]) => mockChatPostMessage(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { postInteractiveBlocks } from "@/integrations/slack/actions/postInteractiveBlocks";
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
  scopes: ["chat:write"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-07T00:00:00Z",
  updatedAt: "2026-05-07T00:00:00Z",
};

const simpleBlocks = [
  {
    type: "section",
    text: { type: "mrkdwn", text: "Hello, world!" },
  },
  {
    type: "actions",
    elements: [
      { type: "button", text: { type: "plain_text", text: "Approve" }, action_id: "approve" },
    ],
  },
];

function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf-1",
    userId: "user-1",
    runId: "run-1",
    nodeId: "n-blocks",
    config,
    triggerEvent: slackEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockChatPostMessage.mockReset();
  mockDecryptToken.mockReset();
});

describe("postInteractiveBlocks — happy path", () => {
  it("decrypts the bot token, calls chat.postMessage with blocks, returns shaped output", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb-real");
    mockChatPostMessage.mockResolvedValueOnce({
      channel: "C1",
      ts: "1730000000.000123",
      message: { blocks: simpleBlocks, user: "U_BOT" },
    });

    const result = await postInteractiveBlocks(
      makeInput({ channel: "C1", blocks: simpleBlocks }),
    );

    expect(mockChatPostMessage).toHaveBeenCalledWith({
      botToken: "xoxb-real",
      channel: "C1",
      blocks: simpleBlocks,
      text: undefined,
      threadTs: undefined,
    });
    expect(result.output).toEqual({
      channel: "C1",
      ts: "1730000000.000123",
      message: { blocks: simpleBlocks, user: "U_BOT" },
    });
  });

  it("forwards optional text fallback for notification preview", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockChatPostMessage.mockResolvedValueOnce({
      channel: "C1",
      ts: "2.0",
      message: {},
    });

    await postInteractiveBlocks(
      makeInput({ channel: "C1", blocks: simpleBlocks, text: "New approval request" }),
    );

    expect(mockChatPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: "New approval request" }),
    );
  });

  it("forwards thread_ts when provided (thread reply with Block Kit)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockChatPostMessage.mockResolvedValueOnce({
      channel: "C1",
      ts: "2.0",
      message: {},
    });

    await postInteractiveBlocks(
      makeInput({ channel: "C1", blocks: simpleBlocks, threadTs: "1.0" }),
    );

    expect(mockChatPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ threadTs: "1.0" }),
    );
  });
});

describe("postInteractiveBlocks — config validation", () => {
  it("rejects missing channel", async () => {
    await expect(
      postInteractiveBlocks(makeInput({ blocks: simpleBlocks })),
    ).rejects.toThrow();
  });

  it("rejects missing blocks", async () => {
    await expect(
      postInteractiveBlocks(makeInput({ channel: "C1" })),
    ).rejects.toThrow();
  });

  it("rejects empty blocks array", async () => {
    await expect(
      postInteractiveBlocks(makeInput({ channel: "C1", blocks: [] })),
    ).rejects.toThrow(/non-empty/);
  });

  it("rejects blocks that aren't an array", async () => {
    await expect(
      postInteractiveBlocks(makeInput({ channel: "C1", blocks: "not-an-array" })),
    ).rejects.toThrow();
  });

  it("rejects a block missing the `type` field", async () => {
    await expect(
      postInteractiveBlocks(
        makeInput({ channel: "C1", blocks: [{ text: { type: "mrkdwn", text: "hi" } }] }),
      ),
    ).rejects.toThrow();
  });

  it("rejects a block with empty `type` string", async () => {
    await expect(
      postInteractiveBlocks(
        makeInput({ channel: "C1", blocks: [{ type: "" }] }),
      ),
    ).rejects.toThrow();
  });

  it("accepts blocks with extra unknown fields (passthrough — Slack validates server-side)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockChatPostMessage.mockResolvedValueOnce({
      channel: "C1",
      ts: "1.0",
      message: {},
    });
    await expect(
      postInteractiveBlocks(
        makeInput({
          channel: "C1",
          blocks: [{ type: "section", custom_field: "anything" }],
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("rejects empty text fallback (must be undefined or non-empty)", async () => {
    await expect(
      postInteractiveBlocks(
        makeInput({ channel: "C1", blocks: simpleBlocks, text: "" }),
      ),
    ).rejects.toThrow();
  });
});

describe("postInteractiveBlocks — integration missing + error propagation", () => {
  it("throws workspace-specific 'connect Slack' when no integration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      postInteractiveBlocks(makeInput({ channel: "C1", blocks: simpleBlocks })),
    ).rejects.toThrow(/No active Slack integration found for workspace T0001/);
  });

  it("propagates SlackApiError on invalid_blocks", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockChatPostMessage.mockRejectedValueOnce(
      new Error("Slack API failed: invalid_blocks"),
    );
    await expect(
      postInteractiveBlocks(makeInput({ channel: "C1", blocks: simpleBlocks })),
    ).rejects.toThrow(/invalid_blocks/);
  });
});
