/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-2 — Discord fetch_messages handler (read-only).
 */
const mockGetActiveForExecution = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActiveForExecution(...args),
}));

const mockMessagesList = jest.fn();
jest.mock("@/integrations/_shared/discord/api/messages", () => ({
  messagesList: (...args: unknown[]) => mockMessagesList(...args),
}));

import { fetchMessages } from "@/integrations/discord/actions/fetchMessages";
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

const baseMessage = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  channel_id: "c1",
  content: `content-${id}`,
  timestamp: `2026-05-23T00:0${id.slice(-1)}:00Z`,
  edited_timestamp: null,
  author: { id: `u${id.slice(-1)}`, username: `user${id.slice(-1)}`, bot: false },
  attachments: [],
  embeds: [],
  mentions: [],
  pinned: false,
  reactions: [],
  type: 0,
  ...overrides,
});

beforeEach(() => {
  mockGetActiveForExecution.mockReset();
  mockMessagesList.mockReset();
});

describe("fetchMessages — defaults", () => {
  it("uses V1 defaults: limit=20, sortOrder=newest, filterType=none, caseSensitive=false", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce([baseMessage("m1"), baseMessage("m2")]);

    const result = await fetchMessages(makeInput({ guildId: "g", channelId: "c1" }));

    expect(mockMessagesList).toHaveBeenCalledWith({ channelId: "c1", limit: 20 });
    expect(result.output.filterType).toBe("none");
    expect(result.output.filterApplied).toBe(false);
    expect(result.output.count).toBe(2);
  });

  it("over-fetches 3x when filter is active (capped at 100)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce([]);
    await fetchMessages(
      makeInput({
        guildId: "g",
        channelId: "c1",
        limit: 10,
        filterType: "content",
        filterContent: "x",
      }),
    );
    // 10 * 3 = 30 (under cap)
    expect(mockMessagesList).toHaveBeenCalledWith({ channelId: "c1", limit: 30 });
  });

  it("caps over-fetch at 100 when limit*3 would exceed", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce([]);
    await fetchMessages(
      makeInput({
        guildId: "g",
        channelId: "c1",
        limit: 50,
        filterType: "content",
        filterContent: "x",
      }),
    );
    expect(mockMessagesList).toHaveBeenCalledWith({ channelId: "c1", limit: 100 });
  });
});

describe("fetchMessages — filterType matrix", () => {
  it("filterType=author keeps only matching author.id", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce([
      baseMessage("m1", { author: { id: "alice", username: "alice" } }),
      baseMessage("m2", { author: { id: "bob", username: "bob" } }),
    ]);

    const result = await fetchMessages(
      makeInput({
        guildId: "g",
        channelId: "c1",
        filterType: "author",
        filterAuthor: "alice",
      }),
    );
    expect(result.output.count).toBe(1);
    expect((result.output.messages as Array<{ id: string }>)[0]!.id).toBe("m1");
  });

  it("filterType=content respects caseSensitive=false (default)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce([
      baseMessage("m1", { content: "Hello WORLD" }),
      baseMessage("m2", { content: "good morning" }),
    ]);
    const result = await fetchMessages(
      makeInput({
        guildId: "g",
        channelId: "c1",
        filterType: "content",
        filterContent: "world",
      }),
    );
    expect(result.output.count).toBe(1);
    expect((result.output.messages as Array<{ id: string }>)[0]!.id).toBe("m1");
  });

  it("filterType=content with caseSensitive=true is strict", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce([
      baseMessage("m1", { content: "Hello WORLD" }),
      baseMessage("m2", { content: "Hello world" }),
    ]);
    const result = await fetchMessages(
      makeInput({
        guildId: "g",
        channelId: "c1",
        filterType: "content",
        filterContent: "world",
        caseSensitive: true,
      }),
    );
    expect(result.output.count).toBe(1);
    expect((result.output.messages as Array<{ id: string }>)[0]!.id).toBe("m2");
  });

  it("filterType=has_attachments / has_embeds / has_reactions", async () => {
    mockGetActiveForExecution.mockResolvedValue(baseIntegration);
    const withAttach = baseMessage("m1", { attachments: [{ id: "a1" }] });
    const withEmbed = baseMessage("m2", { embeds: [{ title: "x" }] });
    const withReact = baseMessage("m3", { reactions: [{ emoji: { id: null, name: "👍" }, count: 1 }] });
    const bare = baseMessage("m4");

    mockMessagesList.mockResolvedValueOnce([withAttach, withEmbed, withReact, bare]);
    const r1 = await fetchMessages(
      makeInput({ guildId: "g", channelId: "c1", filterType: "has_attachments" }),
    );
    expect(r1.output.count).toBe(1);

    mockMessagesList.mockResolvedValueOnce([withAttach, withEmbed, withReact, bare]);
    const r2 = await fetchMessages(
      makeInput({ guildId: "g", channelId: "c1", filterType: "has_embeds" }),
    );
    expect(r2.output.count).toBe(1);

    mockMessagesList.mockResolvedValueOnce([withAttach, withEmbed, withReact, bare]);
    const r3 = await fetchMessages(
      makeInput({ guildId: "g", channelId: "c1", filterType: "has_reactions" }),
    );
    expect(r3.output.count).toBe(1);
  });

  it("filterType=is_pinned", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce([
      baseMessage("m1", { pinned: true }),
      baseMessage("m2", { pinned: false }),
    ]);
    const result = await fetchMessages(
      makeInput({ guildId: "g", channelId: "c1", filterType: "is_pinned" }),
    );
    expect(result.output.count).toBe(1);
  });

  it("filterType=from_bots / from_humans", async () => {
    mockGetActiveForExecution.mockResolvedValue(baseIntegration);
    const bot = baseMessage("m1", { author: { id: "b1", username: "bot", bot: true } });
    const human = baseMessage("m2", { author: { id: "h1", username: "h", bot: false } });

    mockMessagesList.mockResolvedValueOnce([bot, human]);
    const r1 = await fetchMessages(
      makeInput({ guildId: "g", channelId: "c1", filterType: "from_bots" }),
    );
    expect(r1.output.count).toBe(1);
    expect((r1.output.messages as Array<{ id: string }>)[0]!.id).toBe("m1");

    mockMessagesList.mockResolvedValueOnce([bot, human]);
    const r2 = await fetchMessages(
      makeInput({ guildId: "g", channelId: "c1", filterType: "from_humans" }),
    );
    expect(r2.output.count).toBe(1);
    expect((r2.output.messages as Array<{ id: string }>)[0]!.id).toBe("m2");
  });

  it("requires filterAuthor when filterType=author", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    await expect(
      fetchMessages(
        makeInput({ guildId: "g", channelId: "c1", filterType: "author" }),
      ),
    ).rejects.toThrow();
  });

  it("requires filterContent when filterType=content", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    await expect(
      fetchMessages(
        makeInput({ guildId: "g", channelId: "c1", filterType: "content" }),
      ),
    ).rejects.toThrow();
  });
});

describe("fetchMessages — sort order + system-message stripping", () => {
  it("sortOrder=newest preserves Discord's default order", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce([baseMessage("m3"), baseMessage("m2"), baseMessage("m1")]);
    const result = await fetchMessages(
      makeInput({ guildId: "g", channelId: "c1", sortOrder: "newest" }),
    );
    expect((result.output.messages as Array<{ id: string }>).map((m) => m.id)).toEqual([
      "m3",
      "m2",
      "m1",
    ]);
  });

  it("sortOrder=oldest reverses before trimming", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce([baseMessage("m3"), baseMessage("m2"), baseMessage("m1")]);
    const result = await fetchMessages(
      makeInput({ guildId: "g", channelId: "c1", sortOrder: "oldest" }),
    );
    expect((result.output.messages as Array<{ id: string }>).map((m) => m.id)).toEqual([
      "m1",
      "m2",
      "m3",
    ]);
  });

  it("strips system messages (type !== 0) unless they have attachments or embeds", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce([
      baseMessage("m1"), // normal
      baseMessage("m2", { type: 6 }), // pin notification (system)
      baseMessage("m3", { type: 7, attachments: [{ id: "a1" }] }), // system w/ attachment — kept
    ]);
    const result = await fetchMessages(makeInput({ guildId: "g", channelId: "c1" }));
    expect((result.output.messages as Array<{ id: string }>).map((m) => m.id)).toEqual([
      "m1",
      "m3",
    ]);
  });
});

describe("fetchMessages — projection shape", () => {
  it("projects bounded per-message fields (no raw wire passthrough)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce([
      {
        id: "m1",
        channel_id: "c1",
        guild_id: "g1",
        content: "hi",
        timestamp: "t",
        edited_timestamp: null,
        author: {
          id: "u1",
          username: "alice",
          global_name: "Alice",
          discriminator: "0001",
          avatar: "avatar-hash",
          bot: false,
        },
        attachments: [
          { id: "a1", filename: "f.png", size: 100, url: "u", content_type: "image/png", proxy_url: "p" },
        ],
        embeds: [{ title: "e" }],
        mentions: [{ id: "u2", username: "bob" }],
        pinned: false,
        reactions: [{ emoji: { id: null, name: "👍" }, count: 1 }],
        type: 0,
        // wire-only fields that MUST NOT leak through:
        nonce: "should-not-appear",
        webhook_id: "should-not-appear",
        flags: 42,
      },
    ]);
    const result = await fetchMessages(makeInput({ guildId: "g", channelId: "c1" }));
    const [m1] = result.output.messages as Array<Record<string, unknown>>;
    expect(m1!.id).toBe("m1");
    expect(m1!.content).toBe("hi");
    expect(m1).not.toHaveProperty("nonce");
    expect(m1).not.toHaveProperty("webhook_id");
    expect(m1).not.toHaveProperty("flags");
    // Author should be projected, not raw.
    const author = m1!.author as Record<string, unknown>;
    expect(author).not.toHaveProperty("discriminator");
    expect(author).not.toHaveProperty("avatar");
    expect(author.username).toBe("alice");
  });
});

describe("fetchMessages — gate + secret-shape", () => {
  it("throws when no Discord integration", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    await expect(
      fetchMessages(makeInput({ guildId: "g", channelId: "c1" })),
    ).rejects.toThrow(/No active Discord integration/);
  });

  it("no token/secret in output", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(baseIntegration);
    mockMessagesList.mockResolvedValueOnce([baseMessage("m1")]);
    const result = await fetchMessages(makeInput({ guildId: "g", channelId: "c1" }));
    const serialized = JSON.stringify(result.output).toLowerCase();
    expect(serialized).not.toMatch(/token/);
    expect(serialized).not.toMatch(/secret/);
  });
});
