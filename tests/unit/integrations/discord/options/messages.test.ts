/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-3 — discord:messages options resolver (unfiltered).
 */
const mockMessagesList = jest.fn();
jest.mock("@/integrations/_shared/discord/api/messages", () => {
  const actual = jest.requireActual("@/integrations/_shared/discord/api/messages");
  return {
    ...actual,
    messagesList: (...args: unknown[]) => mockMessagesList(...args),
  };
});

import { discordMessagesResolver } from "@/integrations/discord/options/messages";
import { NotFoundError } from "@/integrations/_shared/discord/errors";
import { makeCtx } from "./_testFixtures";

beforeEach(() => {
  mockMessagesList.mockReset();
});

describe("discordMessagesResolver — shape", () => {
  it("declares requiredDeps=['channelId']", () => {
    expect(discordMessagesResolver.source).toBe("discord:messages");
    expect(discordMessagesResolver.requiredDeps).toEqual(["channelId"]);
  });
});

describe("discordMessagesResolver — does NOT filter by author", () => {
  it("returns ALL messages regardless of author (vs discord:bot_messages)", async () => {
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
        content: "from user A",
        timestamp: "2026-05-23T00:02:00Z",
        author: { id: "user-A" },
      },
      {
        id: "m3",
        channel_id: "c1",
        content: "from user B",
        timestamp: "2026-05-23T00:03:00Z",
        author: { id: "user-B" },
      },
    ]);
    const result = await discordMessagesResolver.resolve(
      makeCtx({ deps: { channelId: "c1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["m1", "m2", "m3"]);
  });

  it("calls messagesList with limit=100", async () => {
    mockMessagesList.mockResolvedValueOnce([]);
    await discordMessagesResolver.resolve(
      makeCtx({ deps: { channelId: "c1" } }),
    );
    expect(mockMessagesList).toHaveBeenCalledWith({ channelId: "c1", limit: 100 });
  });

  it("case-insensitive q filter on label", async () => {
    mockMessagesList.mockResolvedValueOnce([
      { id: "m1", content: "Hello world", author: { id: "x" }, timestamp: "t1" },
      { id: "m2", content: "spam", author: { id: "y" }, timestamp: "t2" },
      { id: "m3", content: "Hello again", author: { id: "z" }, timestamp: "t3" },
    ]);
    const result = await discordMessagesResolver.resolve(
      makeCtx({ deps: { channelId: "c1" }, q: "HELLO" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["m1", "m3"]);
  });
});

describe("discordMessagesResolver — errors", () => {
  it("throws MISSING_DEPENDENCY when channelId missing", async () => {
    await expect(
      discordMessagesResolver.resolve(makeCtx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("returns empty items on NotFoundError", async () => {
    mockMessagesList.mockRejectedValueOnce(new NotFoundError("channel c1"));
    const result = await discordMessagesResolver.resolve(
      makeCtx({ deps: { channelId: "c1" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("throws INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      discordMessagesResolver.resolve(
        makeCtx({ integration: null, deps: { channelId: "c1" } }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});
