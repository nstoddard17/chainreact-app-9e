/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-2 — Discord send_message handler.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockMessageCreate = jest.fn();
jest.mock("@/integrations/_shared/discord/api/messages", () => ({
  messageCreate: (...args: unknown[]) => mockMessageCreate(...args),
}));

import { sendMessage } from "@/integrations/discord/actions/sendMessage";
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
    workflowId: "wf-1",
    userId: "user-1",
    accountId: "acct-user-1",
    runId: "run-1",
    nodeId: "n-discord-send",
    config,
    triggerEvent: nativeEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockMessageCreate.mockReset();
});

describe("sendMessage — happy path", () => {
  it("calls messages.create with content + channelId and projects the response", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessageCreate.mockResolvedValueOnce({
      id: "msg-100",
      channel_id: "channel-200",
      content: "hello world",
      timestamp: "2026-05-23T00:05:00Z",
      author: { id: "bot-1", username: "ChainReactBot", bot: true },
    });

    const result = await sendMessage(
      makeInput({ guildId: "guild-1", channelId: "channel-200", message: "hello world" }),
    );

    expect(mockMessageCreate).toHaveBeenCalledWith({
      channelId: "channel-200",
      content: "hello world",
    });
    expect(result.output).toEqual({
      messageId: "msg-100",
      channelId: "channel-200",
      guildId: "guild-1",
      content: "hello world",
      timestamp: "2026-05-23T00:05:00Z",
      author: { id: "bot-1", username: "ChainReactBot", bot: true },
    });
  });

  it("preserves V1 field name `message` (not `content` or `body`) on input", async () => {
    // Schema-level guard: `content` on input must be rejected by .strict().
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    await expect(
      sendMessage(makeInput({ guildId: "g", channelId: "c", content: "should fail" })),
    ).rejects.toThrow();
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });
});

describe("sendMessage — validation", () => {
  it("rejects missing guildId", async () => {
    await expect(
      sendMessage(makeInput({ channelId: "c", message: "hi" })),
    ).rejects.toThrow();
  });

  it("rejects missing channelId", async () => {
    await expect(
      sendMessage(makeInput({ guildId: "g", message: "hi" })),
    ).rejects.toThrow();
  });

  it("rejects empty message", async () => {
    await expect(
      sendMessage(makeInput({ guildId: "g", channelId: "c", message: "" })),
    ).rejects.toThrow();
  });

  it("rejects message >2000 chars (Discord cap)", async () => {
    await expect(
      sendMessage(makeInput({ guildId: "g", channelId: "c", message: "x".repeat(2001) })),
    ).rejects.toThrow(/2000/);
  });
});

describe("sendMessage — integration gate", () => {
  it("throws when no active Discord integration row exists", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      sendMessage(makeInput({ guildId: "g", channelId: "c", message: "hi" })),
    ).rejects.toThrow(/No active Discord integration/);
    expect(mockMessageCreate).not.toHaveBeenCalled();
  });

  it("looks up integration with accountId=null (per-user, single row)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessageCreate.mockResolvedValueOnce({
      id: "m",
      channel_id: "c",
      content: "x",
      timestamp: "t",
      author: { id: "b", username: "b", bot: true },
    });
    await sendMessage(makeInput({ guildId: "g", channelId: "c", message: "x" }));
    expect(mockGetActiveForExecution).toHaveBeenCalledWith("user-1", "discord", null);
  });
});

describe("sendMessage — secret-shape guard on output", () => {
  it("does NOT include any token-shaped field in output", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessageCreate.mockResolvedValueOnce({
      id: "m",
      channel_id: "c",
      content: "x",
      timestamp: "t",
      author: { id: "b", username: "b", bot: true },
    });
    const result = await sendMessage(makeInput({ guildId: "g", channelId: "c", message: "x" }));
    const serialized = JSON.stringify(result.output).toLowerCase();
    expect(serialized).not.toMatch(/token/);
    expect(serialized).not.toMatch(/secret/);
    expect(serialized).not.toMatch(/api[_-]?key/);
  });
});
