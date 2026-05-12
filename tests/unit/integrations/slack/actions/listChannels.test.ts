/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/listChannels (Slack 2.3 Commit 2).
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

const mockConversationsList = jest.fn();
jest.mock("@/integrations/slack/api/conversationsList", () => ({
  conversationsList: (...args: unknown[]) => mockConversationsList(...args),
}));

const mockDecryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  decryptToken: (...args: unknown[]) => mockDecryptToken(...args),
}));

import { listChannels } from "@/integrations/slack/actions/listChannels";
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
  accessTokenEncrypted: "ENCRYPTED_TOKEN",
  refreshTokenEncrypted: null,
  accessTokenExpiresAt: null,
  scopes: ["channels:read", "groups:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-11T00:00:00Z",
  updatedAt: "2026-05-11T00:00:00Z",
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
  mockConversationsList.mockReset();
  mockDecryptToken.mockReset();
});

describe("listChannels — happy path", () => {
  it("decrypts the bot token and calls conversations.list with both public + private + excludeArchived=true by default", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb-real");
    mockConversationsList.mockResolvedValueOnce({
      channels: [
        { id: "C1", name: "general" },
        { id: "C2", name: "random" },
      ],
      hasMore: false,
      nextCursor: null,
    });

    const result = await listChannels(makeInput({}));

    expect(mockConversationsList).toHaveBeenCalledWith({
      botToken: "xoxb-real",
      types: "public_channel,private_channel",
      excludeArchived: true,
      limit: undefined,
      cursor: undefined,
    });
    expect(result.output).toEqual({
      channels: [
        { id: "C1", name: "general" },
        { id: "C2", name: "random" },
      ],
      count: 2,
      hasMore: false,
      nextCursor: null,
    });
  });

  it("translates kind='public' to types=public_channel", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsList.mockResolvedValueOnce({
      channels: [],
      hasMore: false,
      nextCursor: null,
    });

    await listChannels(makeInput({ kind: "public" }));
    expect(mockConversationsList).toHaveBeenCalledWith(
      expect.objectContaining({ types: "public_channel" }),
    );
  });

  it("translates kind='private' to types=private_channel", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsList.mockResolvedValueOnce({
      channels: [],
      hasMore: false,
      nextCursor: null,
    });

    await listChannels(makeInput({ kind: "private" }));
    expect(mockConversationsList).toHaveBeenCalledWith(
      expect.objectContaining({ types: "private_channel" }),
    );
  });

  it("forwards excludeArchived=false explicitly when caller asks for archived channels", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsList.mockResolvedValueOnce({
      channels: [],
      hasMore: false,
      nextCursor: null,
    });

    await listChannels(makeInput({ excludeArchived: false }));
    expect(mockConversationsList).toHaveBeenCalledWith(
      expect.objectContaining({ excludeArchived: false }),
    );
  });

  it("forwards optional limit + cursor to the wrapper", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsList.mockResolvedValueOnce({
      channels: [],
      hasMore: false,
      nextCursor: null,
    });

    await listChannels(
      makeInput({ limit: 50, cursor: "cursor-page-2" }),
    );
    expect(mockConversationsList).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, cursor: "cursor-page-2" }),
    );
  });

  it("surfaces hasMore + nextCursor for pagination output", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsList.mockResolvedValueOnce({
      channels: [{ id: "C1", name: "general" }],
      hasMore: true,
      nextCursor: "cursor-page-2",
    });

    const result = await listChannels(makeInput({}));
    expect(result.output).toEqual({
      channels: [{ id: "C1", name: "general" }],
      count: 1,
      hasMore: true,
      nextCursor: "cursor-page-2",
    });
  });

  it("returns count=0 + nextCursor=null when there are no channels and no more pages", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsList.mockResolvedValueOnce({
      channels: [],
      hasMore: false,
      nextCursor: null,
    });

    const result = await listChannels(makeInput({}));
    expect(result.output).toEqual({
      channels: [],
      count: 0,
      hasMore: false,
      nextCursor: null,
    });
  });
});

describe("listChannels — strict schema (fail-closed on unknown keys + bad values)", () => {
  it("rejects unknown keys (strict schema)", async () => {
    await expect(
      listChannels(makeInput({ noSuchField: "x" })),
    ).rejects.toThrow();
  });

  it("rejects an invalid kind enum value", async () => {
    await expect(
      listChannels(makeInput({ kind: "everything" })),
    ).rejects.toThrow();
  });

  it("rejects limit out of range (>1000)", async () => {
    await expect(
      listChannels(makeInput({ limit: 5000 })),
    ).rejects.toThrow();
  });

  it("rejects empty-string cursor", async () => {
    await expect(
      listChannels(makeInput({ cursor: "" })),
    ).rejects.toThrow();
  });
});

describe("listChannels — error propagation", () => {
  it("propagates SlackApiError when the wrapper rejects", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockDecryptToken.mockReturnValueOnce("xoxb");
    mockConversationsList.mockRejectedValueOnce(
      new Error("Slack API failed: missing_scope"),
    );
    await expect(listChannels(makeInput({}))).rejects.toThrow(
      /missing_scope/,
    );
  });

  it("throws when no Slack integration is active for the user/workspace", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(listChannels(makeInput({}))).rejects.toThrow(
      /No active Slack integration/,
    );
  });
});
