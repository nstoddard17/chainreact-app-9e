/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-3 — Discord guild API wrappers.
 */
import {
  botGuildsList,
  guildChannelsList,
  guildMembersList,
  guildRolesList,
  DISCORD_CHANNEL_TYPE_GUILD_TEXT,
  DISCORD_CHANNEL_TYPE_GUILD_FORUM,
} from "@/integrations/_shared/discord/api/guilds";

const mockFetch = jest.fn();
const originalFetch = global.fetch;
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  process.env.DISCORD_BOT_TOKEN = "bot-token-test";
  delete process.env.DISCORD_API_BASE;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = originalFetch;
});

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: new Headers(),
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

describe("botGuildsList", () => {
  it("GETs /users/@me/guilds with limit clamped to 200", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, [{ id: "g1", name: "Server 1" }]),
    );
    const result = await botGuildsList({ limit: 500 });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://discord.com/api/v10/users/@me/guilds?limit=200");
    expect(result).toEqual([{ id: "g1", name: "Server 1" }]);
  });

  it("defaults limit to 200 when omitted", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, []));
    await botGuildsList();
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("limit=200");
  });

  it("clamps limit floor at 1", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, []));
    await botGuildsList({ limit: 0 });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("limit=1");
  });
});

describe("guildChannelsList", () => {
  it("GETs /guilds/{id}/channels", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, [
        { id: "c1", name: "general", type: DISCORD_CHANNEL_TYPE_GUILD_TEXT },
      ]),
    );
    const result = await guildChannelsList({ guildId: "g1" });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://discord.com/api/v10/guilds/g1/channels");
    expect(result[0]!.type).toBe(DISCORD_CHANNEL_TYPE_GUILD_TEXT);
  });

  it("url-encodes guildId", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, []));
    await guildChannelsList({ guildId: "g 1" });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://discord.com/api/v10/guilds/g%201/channels");
  });
});

describe("guildMembersList", () => {
  it("GETs /guilds/{id}/members with limit + after when provided", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, []));
    await guildMembersList({ guildId: "g1", limit: 500, after: "u-cursor" });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe(
      "https://discord.com/api/v10/guilds/g1/members?limit=500&after=u-cursor",
    );
  });

  it("clamps limit to 1000", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, []));
    await guildMembersList({ guildId: "g1", limit: 5000 });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("limit=1000");
  });
});

describe("guildRolesList", () => {
  it("GETs /guilds/{id}/roles", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, [{ id: "r1", name: "Admin" }]),
    );
    const result = await guildRolesList({ guildId: "g1" });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://discord.com/api/v10/guilds/g1/roles");
    expect(result).toEqual([{ id: "r1", name: "Admin" }]);
  });
});

describe("channel type constants", () => {
  it("text-shaped constants match Discord's documented numeric types", () => {
    expect(DISCORD_CHANNEL_TYPE_GUILD_TEXT).toBe(0);
    expect(DISCORD_CHANNEL_TYPE_GUILD_FORUM).toBe(15);
  });
});
