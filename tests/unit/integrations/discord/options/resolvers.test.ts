/**
 * @jest-environment node
 *
 * discord options-resolver contract suite — one provider-level suite
 * consolidating the former per-resolver files (PROVIDER-CONTRACT-CONSOLIDATION-1C).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockMessagesList = jest.fn();
const mockCurrentBotUser = jest.fn();
const mockGuildChannelsList = jest.fn();
const mockBotGuildsList = jest.fn();
const mockGuildMembersList = jest.fn();
const mockGuildRolesList = jest.fn();

jest.mock("@/integrations/_shared/discord/api/messages", () => {
  const actual = jest.requireActual("@/integrations/_shared/discord/api/messages");
  return {
    ...actual,
    messagesList: (...args: unknown[]) => mockMessagesList(...args),
  };
});

jest.mock("@/integrations/_shared/discord/api/users", () => ({
  currentBotUser: (...args: unknown[]) => mockCurrentBotUser(...args),
}));

jest.mock("@/integrations/_shared/discord/api/guilds", () => {
  const actual = jest.requireActual("@/integrations/_shared/discord/api/guilds");
  return {
    ...actual,
    guildChannelsList: (...args: unknown[]) => mockGuildChannelsList(...args),
    botGuildsList: (...args: unknown[]) => mockBotGuildsList(...args),
    guildMembersList: (...args: unknown[]) => mockGuildMembersList(...args),
    guildRolesList: (...args: unknown[]) => mockGuildRolesList(...args),
  };
});

import { getOptionsResolver, listOptionsResolvers } from "@/services/options/_registry";
import { discordBotMessagesResolver } from "@/integrations/discord/options/botMessages";
import { NotFoundError, DiscordApiError, DiscordBotTokenMissingError } from "@/integrations/_shared/discord/errors";
import { makeCtx } from "./_testFixtures";
import { discordChannelsResolver } from "@/integrations/discord/options/channels";
import { discordGuildsResolver } from "@/integrations/discord/options/guilds";
import { OptionsResolverError } from "@/services/options/types";
import { discordMembersResolver } from "@/integrations/discord/options/members";
import { discordMessagesResolver } from "@/integrations/discord/options/messages";
import { discordRolesResolver } from "@/integrations/discord/options/roles";

// ---------------------------------------------------------------------------
// Merged from the former _registry.test.ts
// Slice 3.DISCORD-3 — confirms all 6 Discord resolvers are registered
// in services/options/_registry.ts with correct shape.
// ---------------------------------------------------------------------------
describe("_registry (options)", () => {

const EXPECTED: ReadonlyArray<{
  source: string;
  provider: string;
  requiresIntegration: boolean;
  requiredDeps?: readonly string[];
}> = [
  { source: "discord:guilds", provider: "discord", requiresIntegration: true },
  { source: "discord:channels", provider: "discord", requiresIntegration: true, requiredDeps: ["guildId"] },
  { source: "discord:members", provider: "discord", requiresIntegration: true, requiredDeps: ["guildId"] },
  { source: "discord:bot_messages", provider: "discord", requiresIntegration: true, requiredDeps: ["channelId"] },
  { source: "discord:messages", provider: "discord", requiresIntegration: true, requiredDeps: ["channelId"] },
  { source: "discord:roles", provider: "discord", requiresIntegration: true, requiredDeps: ["guildId"] },
];

describe("Discord resolvers — registry wiring", () => {
  it.each(EXPECTED)("$source is registered with the right shape", (expected) => {
    const r = getOptionsResolver(expected.source);
    expect(r).toBeDefined();
    expect(r?.provider).toBe(expected.provider);
    expect(r?.requiresIntegration).toBe(expected.requiresIntegration);
    if (expected.requiredDeps) {
      expect(r?.requiredDeps).toEqual(expected.requiredDeps);
    } else {
      expect(r?.requiredDeps).toBeUndefined();
    }
  });

  it("dep names preserve V1 camelCase verbatim (no snake_case normalization)", () => {
    const channels = getOptionsResolver("discord:channels");
    expect(channels?.requiredDeps).toEqual(["guildId"]);
    expect(channels?.requiredDeps?.[0]).not.toBe("guild_id");

    const messages = getOptionsResolver("discord:messages");
    expect(messages?.requiredDeps).toEqual(["channelId"]);
    expect(messages?.requiredDeps?.[0]).not.toBe("channel_id");
  });

  it("exactly 6 Discord resolvers registered (no more, no less)", () => {
    const discords = listOptionsResolvers().filter((r) => r.provider === "discord");
    expect(discords).toHaveLength(6);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former botMessages.test.ts
// Slice 3.DISCORD-3 — discord:bot_messages options resolver.
// ---------------------------------------------------------------------------
describe("botMessages (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former channels.test.ts
// Slice 3.DISCORD-3 — discord:channels options resolver.
// ---------------------------------------------------------------------------
describe("channels (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former guilds.test.ts
// Slice 3.DISCORD-3 — discord:guilds options resolver.
// ---------------------------------------------------------------------------
describe("guilds (options)", () => {

beforeEach(() => {
  mockBotGuildsList.mockReset();
});

describe("discordGuildsResolver — shape", () => {
  it("declares no requiredDeps (top-level picker)", () => {
    expect(discordGuildsResolver.source).toBe("discord:guilds");
    expect(discordGuildsResolver.provider).toBe("discord");
    expect(discordGuildsResolver.requiresIntegration).toBe(true);
    expect(discordGuildsResolver.requiredDeps).toBeUndefined();
  });
});

describe("discordGuildsResolver — happy path", () => {
  it("maps guilds to {value=id, label=name}", async () => {
    mockBotGuildsList.mockResolvedValueOnce([
      { id: "g1", name: "ChainReact HQ" },
      { id: "g2", name: "Workflow Builders" },
    ]);
    const result = await discordGuildsResolver.resolve(makeCtx());
    expect(result.items).toEqual([
      { value: "g1", label: "ChainReact HQ" },
      { value: "g2", label: "Workflow Builders" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("calls botGuildsList with limit=200", async () => {
    mockBotGuildsList.mockResolvedValueOnce([]);
    await discordGuildsResolver.resolve(makeCtx());
    expect(mockBotGuildsList).toHaveBeenCalledWith({ limit: 200 });
  });

  it("falls back to id when guild name is empty", async () => {
    mockBotGuildsList.mockResolvedValueOnce([{ id: "g1", name: "" }]);
    const result = await discordGuildsResolver.resolve(makeCtx());
    expect(result.items).toEqual([{ value: "g1", label: "g1" }]);
  });

  it("drops guilds with missing id", async () => {
    mockBotGuildsList.mockResolvedValueOnce([
      { id: "", name: "no-id" },
      { id: "g1", name: "ok" },
    ]);
    const result = await discordGuildsResolver.resolve(makeCtx());
    expect(result.items).toEqual([{ value: "g1", label: "ok" }]);
  });

  it("applies case-insensitive q filter on label", async () => {
    mockBotGuildsList.mockResolvedValueOnce([
      { id: "g1", name: "Alpha Server" },
      { id: "g2", name: "Beta Server" },
      { id: "g3", name: "Gamma" },
    ]);
    const result = await discordGuildsResolver.resolve(makeCtx({ q: "SERVER" }));
    expect(result.items.map((i) => i.value)).toEqual(["g1", "g2"]);
  });

  it("hasMore=true when wire returned full 200-item page", async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({ id: `g${i}`, name: `G${i}` }));
    mockBotGuildsList.mockResolvedValueOnce(fullPage);
    const result = await discordGuildsResolver.resolve(makeCtx());
    expect(result.hasMore).toBe(true);
  });
});

describe("discordGuildsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null", async () => {
    await expect(
      discordGuildsResolver.resolve(makeCtx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockBotGuildsList).not.toHaveBeenCalled();
  });

  it("maps DiscordBotTokenMissingError → PROVIDER_ERROR (admin-facing wording)", async () => {
    mockBotGuildsList.mockRejectedValueOnce(new DiscordBotTokenMissingError());
    const promise = discordGuildsResolver.resolve(makeCtx());
    await expect(promise).rejects.toBeInstanceOf(OptionsResolverError);
    await expect(promise).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    await expect(promise).rejects.toThrow(/admin/i);
  });

  it("maps DiscordApiError 401 → PROVIDER_ERROR with bot-token-invalid wording", async () => {
    mockBotGuildsList.mockRejectedValueOnce(
      new DiscordApiError(401, 0, "401: Unauthorized"),
    );
    const promise = discordGuildsResolver.resolve(makeCtx());
    await expect(promise).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    await expect(promise).rejects.toThrow(/bot token is invalid/i);
  });

  it("maps DiscordApiError 403 → PROVIDER_ERROR with bot-permission wording", async () => {
    mockBotGuildsList.mockRejectedValueOnce(
      new DiscordApiError(403, 50001, "Missing Access"),
    );
    const promise = discordGuildsResolver.resolve(makeCtx());
    await expect(promise).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    await expect(promise).rejects.toThrow(/lacks access to servers/i);
  });

  it("maps generic errors → PROVIDER_ERROR with generic wording (no secret leakage)", async () => {
    mockBotGuildsList.mockRejectedValueOnce(
      new Error("ECONNRESET: bot-token-deadbeef leaked"),
    );
    let caught: unknown;
    try {
      await discordGuildsResolver.resolve(makeCtx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error & { code?: string };
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toContain("bot-token-deadbeef");
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former members.test.ts
// Slice 3.DISCORD-3 — discord:members options resolver.
// ---------------------------------------------------------------------------
describe("members (options)", () => {

beforeEach(() => {
  mockGuildMembersList.mockReset();
});

describe("discordMembersResolver — shape", () => {
  it("declares requiredDeps=['guildId']", () => {
    expect(discordMembersResolver.source).toBe("discord:members");
    expect(discordMembersResolver.requiredDeps).toEqual(["guildId"]);
  });
});

describe("discordMembersResolver — label priority", () => {
  it("nick > global_name > username > user.id", async () => {
    mockGuildMembersList.mockResolvedValueOnce([
      { user: { id: "u1", username: "alice", global_name: "Alice" }, nick: "Boss" },
      { user: { id: "u2", username: "bob", global_name: "Bobby" } },
      { user: { id: "u3", username: "carol" } },
      { user: { id: "u4" } },
    ]);
    const result = await discordMembersResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items).toEqual([
      { value: "u1", label: "Boss", description: "alice" },
      { value: "u2", label: "Bobby", description: "bob" },
      { value: "u3", label: "carol" },
      { value: "u4", label: "u4" },
    ]);
  });

  it("does NOT duplicate username in description when label === username", async () => {
    mockGuildMembersList.mockResolvedValueOnce([
      { user: { id: "u1", username: "alice" } }, // no nick, no global_name
    ]);
    const result = await discordMembersResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items).toEqual([{ value: "u1", label: "alice" }]);
  });

  it("drops members with no user object", async () => {
    mockGuildMembersList.mockResolvedValueOnce([
      { nick: "ghost" }, // no user
      { user: { id: "u1", username: "alice" } },
    ]);
    const result = await discordMembersResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["u1"]);
  });
});

describe("discordMembersResolver — q filter + pagination", () => {
  it("case-insensitive q filter on label", async () => {
    mockGuildMembersList.mockResolvedValueOnce([
      { user: { id: "u1", username: "alice_admin" } },
      { user: { id: "u2", username: "bob" } },
      { user: { id: "u3", username: "alice_dev" } },
    ]);
    const result = await discordMembersResolver.resolve(
      makeCtx({ deps: { guildId: "g1" }, q: "ALICE" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["u1", "u3"]);
  });

  it("hasMore=true when wire returned full 1000-item page", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      user: { id: `u${i}`, username: `user${i}` },
    }));
    mockGuildMembersList.mockResolvedValueOnce(fullPage);
    const result = await discordMembersResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.hasMore).toBe(true);
  });

  it("calls guildMembersList with limit=1000", async () => {
    mockGuildMembersList.mockResolvedValueOnce([]);
    await discordMembersResolver.resolve(makeCtx({ deps: { guildId: "g1" } }));
    expect(mockGuildMembersList).toHaveBeenCalledWith({ guildId: "g1", limit: 1000 });
  });
});

describe("discordMembersResolver — errors", () => {
  it("throws MISSING_DEPENDENCY when guildId is missing", async () => {
    await expect(
      discordMembersResolver.resolve(makeCtx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("returns empty items on NotFoundError", async () => {
    mockGuildMembersList.mockRejectedValueOnce(new NotFoundError("guild g1 members"));
    const result = await discordMembersResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("throws INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      discordMembersResolver.resolve(
        makeCtx({ integration: null, deps: { guildId: "g1" } }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former messages.test.ts
// Slice 3.DISCORD-3 — discord:messages options resolver (unfiltered).
// ---------------------------------------------------------------------------
describe("messages (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former roles.test.ts
// Slice 3.DISCORD-3 — discord:roles options resolver.
// ---------------------------------------------------------------------------
describe("roles (options)", () => {

beforeEach(() => {
  mockGuildRolesList.mockReset();
});

describe("discordRolesResolver — shape", () => {
  it("declares requiredDeps=['guildId']", () => {
    expect(discordRolesResolver.source).toBe("discord:roles");
    expect(discordRolesResolver.requiredDeps).toEqual(["guildId"]);
  });
});

describe("discordRolesResolver — filtering", () => {
  it("drops @everyone (id === guildId)", async () => {
    mockGuildRolesList.mockResolvedValueOnce([
      { id: "g1", name: "@everyone", position: 0 },
      { id: "r1", name: "Member", position: 1 },
    ]);
    const result = await discordRolesResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["r1"]);
  });

  it("drops managed roles (bot integrations / boosters)", async () => {
    mockGuildRolesList.mockResolvedValueOnce([
      { id: "r1", name: "Member", position: 1 },
      { id: "bot-integration", name: "ChainReact Bot", position: 5, managed: true },
      { id: "booster", name: "Server Booster", position: 10, managed: true },
    ]);
    const result = await discordRolesResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["r1"]);
  });

  it("sorts by position descending (highest first)", async () => {
    mockGuildRolesList.mockResolvedValueOnce([
      { id: "r1", name: "Member", position: 1 },
      { id: "r3", name: "Admin", position: 10 },
      { id: "r2", name: "Mod", position: 5 },
    ]);
    const result = await discordRolesResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["r3", "r2", "r1"]);
  });

  it("drops roles missing required fields (no id / no name)", async () => {
    mockGuildRolesList.mockResolvedValueOnce([
      { id: "", name: "no-id" },
      { id: "r1", name: "" },
      { id: "r2", name: "Valid", position: 1 },
    ]);
    const result = await discordRolesResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["r2"]);
  });

  it("case-insensitive q filter on label", async () => {
    mockGuildRolesList.mockResolvedValueOnce([
      { id: "r1", name: "Admin", position: 10 },
      { id: "r2", name: "Mod", position: 5 },
      { id: "r3", name: "Moderator", position: 4 },
    ]);
    const result = await discordRolesResolver.resolve(
      makeCtx({ deps: { guildId: "g1" }, q: "MOD" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["r2", "r3"]);
  });
});

describe("discordRolesResolver — errors", () => {
  it("throws MISSING_DEPENDENCY when guildId missing", async () => {
    await expect(
      discordRolesResolver.resolve(makeCtx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("returns empty items on NotFoundError", async () => {
    mockGuildRolesList.mockRejectedValueOnce(new NotFoundError("guild g1"));
    const result = await discordRolesResolver.resolve(
      makeCtx({ deps: { guildId: "g1" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("throws INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      discordRolesResolver.resolve(
        makeCtx({ integration: null, deps: { guildId: "g1" } }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

});
