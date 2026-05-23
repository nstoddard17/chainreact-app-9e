/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-3 — discord:channels options resolver.
 */
const mockGuildChannelsList = jest.fn();
jest.mock("@/integrations/_shared/discord/api/guilds", () => {
  const actual = jest.requireActual("@/integrations/_shared/discord/api/guilds");
  return {
    ...actual,
    guildChannelsList: (...args: unknown[]) => mockGuildChannelsList(...args),
  };
});

import { discordChannelsResolver } from "@/integrations/discord/options/channels";
import { NotFoundError } from "@/integrations/_shared/discord/errors";
import { makeCtx } from "./_testFixtures";

beforeEach(() => {
  mockGuildChannelsList.mockReset();
});

describe("discordChannelsResolver — shape", () => {
  it("declares requiredDeps=['guildId'] (V1 field name preserved)", () => {
    expect(discordChannelsResolver.source).toBe("discord:channels");
    expect(discordChannelsResolver.requiredDeps).toEqual(["guildId"]);
  });
});

describe("discordChannelsResolver — text-shape filtering", () => {
  it("keeps GUILD_TEXT (0), GUILD_ANNOUNCEMENT (5), GUILD_FORUM (15)", async () => {
    mockGuildChannelsList.mockResolvedValueOnce([
      { id: "c1", name: "general", type: 0 },
      { id: "c2", name: "announcements", type: 5 },
      { id: "c3", name: "discussions", type: 15 },
    ]);
    const result = await discordChannelsResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["c1", "c2", "c3"]);
  });

  it("drops voice (2), category (4), stage (13), media (16), threads (11, 12)", async () => {
    mockGuildChannelsList.mockResolvedValueOnce([
      { id: "c1", name: "general", type: 0 },
      { id: "v1", name: "voice", type: 2 },
      { id: "cat", name: "Category", type: 4 },
      { id: "t1", name: "thread", type: 11 },
      { id: "t2", name: "private-thread", type: 12 },
      { id: "stage", name: "Stage", type: 13 },
      { id: "media", name: "Media", type: 16 },
    ]);
    const result = await discordChannelsResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["c1"]);
  });

  it("drops channels with no id or no type", async () => {
    mockGuildChannelsList.mockResolvedValueOnce([
      { id: "", name: "bad", type: 0 },
      { id: "c2", name: "missing-type" },
      { id: "c3", name: "ok", type: 0 },
    ]);
    const result = await discordChannelsResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["c3"]);
  });
});

describe("discordChannelsResolver — mapping", () => {
  it("labels with # prefix; surfaces topic as description when present", async () => {
    mockGuildChannelsList.mockResolvedValueOnce([
      { id: "c1", name: "general", type: 0, topic: "  Main discussion  " },
      { id: "c2", name: "random", type: 0, topic: "" },
      { id: "c3", name: "off-topic", type: 0 },
    ]);
    const result = await discordChannelsResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items).toEqual([
      { value: "c1", label: "#general", description: "Main discussion" },
      { value: "c2", label: "#random" },
      { value: "c3", label: "#off-topic" },
    ]);
  });

  it("falls back to id label when name is empty", async () => {
    mockGuildChannelsList.mockResolvedValueOnce([
      { id: "c1", name: "", type: 0 },
    ]);
    const result = await discordChannelsResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items).toEqual([{ value: "c1", label: "c1" }]);
  });

  it("case-insensitive q filter on label (#prefix included)", async () => {
    mockGuildChannelsList.mockResolvedValueOnce([
      { id: "c1", name: "general", type: 0 },
      { id: "c2", name: "general-help", type: 0 },
      { id: "c3", name: "random", type: 0 },
    ]);
    const result = await discordChannelsResolver.resolve(
      makeCtx({ deps: { guildId: "g1" }, q: "GENERAL" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["c1", "c2"]);
  });
});

describe("discordChannelsResolver — errors", () => {
  it("throws MISSING_DEPENDENCY when guildId is empty", async () => {
    await expect(
      discordChannelsResolver.resolve(makeCtx({ deps: { guildId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockGuildChannelsList).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when guildId is missing", async () => {
    await expect(
      discordChannelsResolver.resolve(makeCtx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("returns empty items when guild not found (NotFoundError)", async () => {
    mockGuildChannelsList.mockRejectedValueOnce(new NotFoundError("guild g1"));
    const result = await discordChannelsResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("throws INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      discordChannelsResolver.resolve(
        makeCtx({ integration: null, deps: { guildId: "g1" } }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});
