/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-2 — Discord delete_message handler (destructive + bulk).
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockMessageDelete = jest.fn();
const mockMessagesBulkDelete = jest.fn();
const mockMessagesList = jest.fn();
jest.mock("@/integrations/_shared/discord/api/messages", () => ({
  messageDelete: (...args: unknown[]) => mockMessageDelete(...args),
  messagesBulkDelete: (...args: unknown[]) => mockMessagesBulkDelete(...args),
  messagesList: (...args: unknown[]) => mockMessagesList(...args),
}));

import { deleteMessage } from "@/integrations/discord/actions/deleteMessage";
import { DiscordApiError } from "@/integrations/_shared/discord/errors";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const nativeEvent: TriggerEvent = {
  provider: "native",
  eventType: "manual.run",
  eventId: "ev1",
  occurredAt: "2026-05-23T00:00:00Z",
  providerAccountId: "discord-user-1",
  payload: {},
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "discord",
  providerAccountId: "discord-user-1",
  displayName: "Alice",
  accessTokenEncrypted: "ENC",
  refreshTokenEncrypted: "ENC-R",
  accessTokenExpiresAt: null,
  scopes: ["identify", "email", "bot", "guilds"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-23T00:00:00Z",
  updatedAt: "2026-05-23T00:00:00Z",
};

function makeInput(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run",
    nodeId: "n",
    config,
    triggerEvent: nativeEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockMessageDelete.mockReset();
  mockMessagesBulkDelete.mockReset();
  mockMessagesList.mockReset();
});

describe("deleteMessage — empty-filter safety", () => {
  it("returns deletedCount=0 without calling Discord when no messageIds + no userIds + no keywords", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);

    const result = await deleteMessage(makeInput({ guildId: "g", channelId: "c" }));

    expect(result.output).toEqual({
      deletedCount: 0,
      failedCount: 0,
      totalProcessed: 0,
      messageIds: [],
      channelId: "c",
    });
    expect(mockMessagesList).not.toHaveBeenCalled();
    expect(mockMessagesBulkDelete).not.toHaveBeenCalled();
    expect(mockMessageDelete).not.toHaveBeenCalled();
  });
});

describe("deleteMessage — explicit messageIds path", () => {
  it("single messageId uses messageDelete (not bulk-delete)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessageDelete.mockResolvedValueOnce(undefined);

    const result = await deleteMessage(
      makeInput({ guildId: "g", channelId: "c1", messageIds: ["m1"] }),
    );

    expect(mockMessageDelete).toHaveBeenCalledWith({
      channelId: "c1",
      messageId: "m1",
    });
    expect(mockMessagesBulkDelete).not.toHaveBeenCalled();
    expect(result.output).toEqual({
      deletedCount: 1,
      failedCount: 0,
      totalProcessed: 1,
      messageIds: ["m1"],
      channelId: "c1",
    });
  });

  it("2-100 messageIds uses messagesBulkDelete", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesBulkDelete.mockResolvedValueOnce(undefined);

    const ids = ["m1", "m2", "m3"];
    const result = await deleteMessage(
      makeInput({ guildId: "g", channelId: "c1", messageIds: ids }),
    );

    expect(mockMessagesBulkDelete).toHaveBeenCalledWith({
      channelId: "c1",
      messageIds: ids,
    });
    expect(result.output).toEqual({
      deletedCount: 3,
      failedCount: 0,
      totalProcessed: 3,
      messageIds: ids,
      channelId: "c1",
    });
  });

  it(">100 messageIds chunks into multiple bulk-delete calls", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesBulkDelete.mockResolvedValue(undefined);

    const ids = Array.from({ length: 250 }, (_, i) => `m${i}`);
    const result = await deleteMessage(
      makeInput({ guildId: "g", channelId: "c", messageIds: ids }),
    );

    expect(mockMessagesBulkDelete).toHaveBeenCalledTimes(3); // 100 + 100 + 50
    const totalIdsSent = mockMessagesBulkDelete.mock.calls
      .map((c) => c[0].messageIds.length)
      .reduce((a, b) => a + b, 0);
    expect(totalIdsSent).toBe(250);
    expect(result.output.deletedCount).toBe(250);
    expect(result.output.totalProcessed).toBe(250);
  });

  it("bulk-delete 400 (likely 14-day rule) falls back to per-message DELETE", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesBulkDelete.mockRejectedValueOnce(
      new DiscordApiError(400, 50034, "You can only bulk delete messages that are under 14 days old."),
    );
    mockMessageDelete.mockResolvedValue(undefined);

    const ids = ["old1", "old2", "old3"];
    const result = await deleteMessage(
      makeInput({ guildId: "g", channelId: "c", messageIds: ids }),
    );

    expect(mockMessagesBulkDelete).toHaveBeenCalledTimes(1);
    expect(mockMessageDelete).toHaveBeenCalledTimes(3);
    expect(result.output.deletedCount).toBe(3);
    expect(result.output.failedCount).toBe(0);
  });

  it("records per-id failures in the errors[] array during single-fallback", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesBulkDelete.mockRejectedValueOnce(
      new DiscordApiError(400, 50034, "older than 14 days"),
    );
    mockMessageDelete
      .mockResolvedValueOnce(undefined) // m1 ok
      .mockRejectedValueOnce(new Error("network")) // m2 fail
      .mockResolvedValueOnce(undefined); // m3 ok

    const result = await deleteMessage(
      makeInput({ guildId: "g", channelId: "c", messageIds: ["m1", "m2", "m3"] }),
    );

    expect(result.output.deletedCount).toBe(2);
    expect(result.output.failedCount).toBe(1);
    expect(result.output.errors).toEqual(["m2: network"]);
  });

  it("rethrows non-400/403 bulk-delete errors without fallback", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesBulkDelete.mockRejectedValueOnce(new DiscordApiError(500, null, "boom"));

    await expect(
      deleteMessage(makeInput({ guildId: "g", channelId: "c", messageIds: ["a", "b"] })),
    ).rejects.toThrow(/HTTP 500/);
    expect(mockMessageDelete).not.toHaveBeenCalled();
  });
});

describe("deleteMessage — filter modes", () => {
  const baseMessages = [
    { id: "m1", channel_id: "c", content: "Hello world", author: { id: "u1" }, type: 0 },
    { id: "m2", channel_id: "c", content: "FOO bar", author: { id: "u2" }, type: 0 },
    { id: "m3", channel_id: "c", content: "spammy spam SPAM", author: { id: "u1" }, type: 0 },
    { id: "m4", channel_id: "c", content: "unrelated", author: { id: "u3" }, type: 0 },
  ];

  it("userIds filter: keeps only messages whose author.id matches", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce(baseMessages);
    mockMessagesBulkDelete.mockResolvedValueOnce(undefined);

    const result = await deleteMessage(
      makeInput({ guildId: "g", channelId: "c", userIds: ["u1"] }),
    );

    expect(mockMessagesBulkDelete).toHaveBeenCalledWith({
      channelId: "c",
      messageIds: ["m1", "m3"],
    });
    expect(result.output.deletedCount).toBe(2);
  });

  it("keywords + partial (default): case-insensitive substring", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce(baseMessages);
    // Single-match → handler uses single-message DELETE, not bulk-delete.
    mockMessageDelete.mockResolvedValueOnce(undefined);

    const result = await deleteMessage(
      makeInput({ guildId: "g", channelId: "c", keywords: ["foo"] }),
    );

    // "FOO bar" matches partial (case-insensitive); single hit routes
    // through messageDelete (bulk-delete requires 2-100 messages).
    expect(mockMessageDelete).toHaveBeenCalledWith({
      channelId: "c",
      messageId: "m2",
    });
    expect(mockMessagesBulkDelete).not.toHaveBeenCalled();
    expect(result.output.deletedCount).toBe(1);
    expect(result.output.messageIds).toEqual(["m2"]);
  });

  it("keywords + whole: case-insensitive whole-word", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce(baseMessages);
    mockMessageDelete.mockResolvedValueOnce(undefined);

    const result = await deleteMessage(
      makeInput({
        guildId: "g",
        channelId: "c",
        keywords: ["spam"],
        keywordMatchType: "whole",
      }),
    );

    // "spammy spam SPAM" — `spam` matches whole word twice (and SPAM via case-insensitive); m1+m2+m4 don't.
    expect(result.output.deletedCount).toBe(1);
    expect(result.output.messageIds).toEqual(["m3"]);
  });

  it("keywords + exact: case-sensitive substring", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce(baseMessages);
    mockMessageDelete.mockResolvedValueOnce(undefined);

    const result = await deleteMessage(
      makeInput({
        guildId: "g",
        channelId: "c",
        keywords: ["FOO"],
        keywordMatchType: "exact",
      }),
    );

    // Only m2 contains literal "FOO".
    expect(result.output.deletedCount).toBe(1);
    expect(result.output.messageIds).toEqual(["m2"]);
  });

  it("userIds + keywords compose as AND", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce(baseMessages);
    mockMessageDelete.mockResolvedValueOnce(undefined);

    const result = await deleteMessage(
      makeInput({
        guildId: "g",
        channelId: "c",
        userIds: ["u1"],
        keywords: ["spam"],
      }),
    );

    // u1 messages: m1 ("Hello world"), m3 ("spammy spam SPAM"). m3 only contains "spam".
    expect(result.output.deletedCount).toBe(1);
    expect(result.output.messageIds).toEqual(["m3"]);
  });

  it("returns zero when filter matches no messages", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce(baseMessages);

    const result = await deleteMessage(
      makeInput({ guildId: "g", channelId: "c", userIds: ["nobody"] }),
    );

    expect(result.output.deletedCount).toBe(0);
    expect(mockMessageDelete).not.toHaveBeenCalled();
    expect(mockMessagesBulkDelete).not.toHaveBeenCalled();
  });

  it("fetches the most recent 100 messages for filtering", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce([]);
    await deleteMessage(makeInput({ guildId: "g", channelId: "c", userIds: ["u1"] }));
    expect(mockMessagesList).toHaveBeenCalledWith({ channelId: "c", limit: 100 });
  });
});

describe("deleteMessage — integration gate", () => {
  it("throws when no Discord integration exists", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      deleteMessage(makeInput({ guildId: "g", channelId: "c", messageIds: ["m1"] })),
    ).rejects.toThrow(/No active Discord integration/);
  });
});
