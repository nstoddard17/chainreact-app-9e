/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-3 — discord:bot_messages options resolver.
 */
const mockMessagesList = jest.fn();
jest.mock("@/integrations/_shared/discord/api/messages", () => {
  const actual = jest.requireActual("@/integrations/_shared/discord/api/messages");
  return {
    ...actual,
    messagesList: (...args: unknown[]) => mockMessagesList(...args),
  };
});

const mockCurrentBotUser = jest.fn();
jest.mock("@/integrations/_shared/discord/api/users", () => ({
  currentBotUser: (...args: unknown[]) => mockCurrentBotUser(...args),
}));

import { discordBotMessagesResolver } from "@/integrations/discord/options/botMessages";
import { NotFoundError } from "@/integrations/_shared/discord/errors";
import { makeCtx } from "./_testFixtures";

beforeEach(() => {
  mockMessagesList.mockReset();
  mockCurrentBotUser.mockReset();
});

describe("discordBotMessagesResolver — shape", () => {
  it("declares requiredDeps=['channelId']", () => {
    expect(discordBotMessagesResolver.source).toBe("discord:bot_messages");
    expect(discordBotMessagesResolver.requiredDeps).toEqual(["channelId"]);
  });
});

describe("discordBotMessagesResolver — bot-author filtering", () => {
  it("filters to messages whose author.id === bot user id", async () => {
    mockCurrentBotUser.mockResolvedValueOnce({ id: "bot-1" });
    mockMessagesList.mockResolvedValueOnce([
      {
        id: "m1",
        channel_id: "c1",
        content: "from bot",
        timestamp: "2026-05-23T00:01:00Z",
        author: { id: "bot-1" },
      },
      {
        id: "m2",
        channel_id: "c1",
        content: "from user",
        timestamp: "2026-05-23T00:02:00Z",
        author: { id: "user-x" },
      },
      {
        id: "m3",
        channel_id: "c1",
        content: "another bot msg",
        timestamp: "2026-05-23T00:03:00Z",
        author: { id: "bot-1" },
      },
    ]);
    const result = await discordBotMessagesResolver.resolve(
      makeCtx({ deps: { channelId: "c1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["m1", "m3"]);
  });

  it("returns empty when no bot-authored messages found", async () => {
    mockCurrentBotUser.mockResolvedValueOnce({ id: "bot-1" });
    mockMessagesList.mockResolvedValueOnce([
      { id: "m1", channel_id: "c1", content: "user", author: { id: "user-x" } },
    ]);
    const result = await discordBotMessagesResolver.resolve(
      makeCtx({ deps: { channelId: "c1" } }),
    );
    expect(result.items).toEqual([]);
  });

  it("messageMapping: truncates labels >60 chars + uses timestamp as description", async () => {
    mockCurrentBotUser.mockResolvedValueOnce({ id: "bot-1" });
    const longContent = "x".repeat(75);
    mockMessagesList.mockResolvedValueOnce([
      {
        id: "m1",
        channel_id: "c1",
        content: longContent,
        timestamp: "2026-05-23T00:01:00Z",
        author: { id: "bot-1" },
      },
    ]);
    const result = await discordBotMessagesResolver.resolve(
      makeCtx({ deps: { channelId: "c1" } }),
    );
    expect(result.items).toEqual([
      {
        value: "m1",
        label: `${"x".repeat(60)}…`,
        description: "2026-05-23T00:01:00Z",
      },
    ]);
  });

  it("handles attachment-only / embed-only messages with empty content", async () => {
    mockCurrentBotUser.mockResolvedValueOnce({ id: "bot-1" });
    mockMessagesList.mockResolvedValueOnce([
      {
        id: "m1",
        channel_id: "c1",
        content: "",
        timestamp: "2026-05-23T00:01:00Z",
        author: { id: "bot-1" },
        attachments: [{ id: "a1" }, { id: "a2" }],
      },
      {
        id: "m2",
        channel_id: "c1",
        content: "",
        timestamp: "2026-05-23T00:02:00Z",
        author: { id: "bot-1" },
        embeds: [{ title: "Embed" }],
      },
    ]);
    const result = await discordBotMessagesResolver.resolve(
      makeCtx({ deps: { channelId: "c1" } }),
    );
    expect(result.items[0]!.label).toBe("(2 attachments)");
    expect(result.items[1]!.label).toBe("(1 embed)");
  });
});

describe("discordBotMessagesResolver — errors", () => {
  it("throws MISSING_DEPENDENCY when channelId is missing", async () => {
    await expect(
      discordBotMessagesResolver.resolve(makeCtx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockCurrentBotUser).not.toHaveBeenCalled();
    expect(mockMessagesList).not.toHaveBeenCalled();
  });

  it("returns empty items on NotFoundError from messages list", async () => {
    mockCurrentBotUser.mockResolvedValueOnce({ id: "bot-1" });
    mockMessagesList.mockRejectedValueOnce(new NotFoundError("channel c1"));
    const result = await discordBotMessagesResolver.resolve(
      makeCtx({ deps: { channelId: "c1" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("throws PROVIDER_ERROR when currentBotUser fails", async () => {
    mockCurrentBotUser.mockRejectedValueOnce(new Error("boom"));
    await expect(
      discordBotMessagesResolver.resolve(makeCtx({ deps: { channelId: "c1" } })),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });

  it("throws INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      discordBotMessagesResolver.resolve(
        makeCtx({ integration: null, deps: { channelId: "c1" } }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});
