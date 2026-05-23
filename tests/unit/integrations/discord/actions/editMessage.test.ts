/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-2 — Discord edit_message handler.
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockMessageEdit = jest.fn();
jest.mock("@/integrations/_shared/discord/api/messages", () => ({
  messageEdit: (...args: unknown[]) => mockMessageEdit(...args),
}));

import { editMessage } from "@/integrations/discord/actions/editMessage";
import { DiscordApiError } from "@/integrations/_shared/discord/errors";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const nativeEvent: TriggerEvent = {
  provider: "native",
  eventType: "manual.run",
  eventId: "ev1",
  occurredAt: "2026-05-23T00:00:00Z",
  accountId: "discord-user-1",
  payload: {},
};

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
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
    runId: "run",
    nodeId: "n",
    config,
    triggerEvent: nativeEvent,
  };
}

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockMessageEdit.mockReset();
});

describe("editMessage — happy path", () => {
  it("PATCHes via messageEdit + projects response", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessageEdit.mockResolvedValueOnce({
      id: "m1",
      channel_id: "c1",
      content: "edited!",
      edited_timestamp: "2026-05-23T00:10:00Z",
      author: { id: "bot", username: "Bot", bot: true },
    });

    const result = await editMessage(
      makeInput({
        guildId: "g",
        channelId: "c1",
        messageId: "m1",
        content: "edited!",
      }),
    );

    expect(mockMessageEdit).toHaveBeenCalledWith({
      channelId: "c1",
      messageId: "m1",
      content: "edited!",
    });
    expect(result.output).toEqual({
      messageId: "m1",
      channelId: "c1",
      content: "edited!",
      editedTimestamp: "2026-05-23T00:10:00Z",
      author: { id: "bot", username: "Bot", bot: true },
    });
  });

  it("preserves V1 field name `content` (not `message`) on input", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    await expect(
      editMessage(makeInput({ guildId: "g", channelId: "c", messageId: "m", message: "x" })),
    ).rejects.toThrow();
    expect(mockMessageEdit).not.toHaveBeenCalled();
  });
});

describe("editMessage — Discord 403/50005 special case", () => {
  it("rethrows a bot-specific message when Discord returns 'cannot edit another author'", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessageEdit.mockRejectedValueOnce(
      new DiscordApiError(403, 50005, "Cannot edit a message authored by another user"),
    );

    await expect(
      editMessage(makeInput({ guildId: "g", channelId: "c", messageId: "m", content: "x" })),
    ).rejects.toThrow(/Discord limits message edits to the original author/);
  });

  it("passes through other 403s unchanged (not 50005)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    const err = new DiscordApiError(403, 50013, "Missing Permissions");
    mockMessageEdit.mockRejectedValueOnce(err);

    await expect(
      editMessage(makeInput({ guildId: "g", channelId: "c", messageId: "m", content: "x" })),
    ).rejects.toBe(err);
  });
});

describe("editMessage — validation + gate", () => {
  it("rejects missing required fields", async () => {
    await expect(
      editMessage(makeInput({ guildId: "g", channelId: "c", messageId: "m" })),
    ).rejects.toThrow();
  });

  it("throws on missing integration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      editMessage(makeInput({ guildId: "g", channelId: "c", messageId: "m", content: "x" })),
    ).rejects.toThrow(/No active Discord integration/);
  });
});
