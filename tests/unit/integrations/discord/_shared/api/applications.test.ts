/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-6 — Discord applications API wrappers.
 *
 * Pins:
 *   - `guildCommandCreate` POSTs `/applications/{app_id}/guilds/{guild_id}/commands`
 *     with `{name, description, type: 1}`. Upserts by name.
 *   - `guildCommandDelete` DELETEs `.../commands/{command_id}` and
 *     resolves with `null` on Discord's 204 response.
 *   - `getDiscordApplicationId` throws when `DISCORD_APPLICATION_ID`
 *     is unset (fail-closed at design time).
 *   - URL encoding is applied to path segments (guards against
 *     accidental injection from upstream config).
 */
import {
  guildCommandCreate,
  guildCommandDelete,
  getDiscordApplicationId,
} from "@/integrations/_shared/discord/api/applications";

const mockFetch = jest.fn();
const originalFetch = global.fetch;
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  process.env.DISCORD_BOT_TOKEN = "bot-token";
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

describe("getDiscordApplicationId", () => {
  it("returns the env value when set", () => {
    process.env.DISCORD_APPLICATION_ID = "app-123";
    expect(getDiscordApplicationId()).toBe("app-123");
    delete process.env.DISCORD_APPLICATION_ID;
  });

  it("throws when unset (fail-closed at design time)", () => {
    delete process.env.DISCORD_APPLICATION_ID;
    expect(() => getDiscordApplicationId()).toThrow(/DISCORD_APPLICATION_ID/);
  });

  it("throws when set to empty string", () => {
    process.env.DISCORD_APPLICATION_ID = "";
    expect(() => getDiscordApplicationId()).toThrow(/DISCORD_APPLICATION_ID/);
    delete process.env.DISCORD_APPLICATION_ID;
  });
});

describe("guildCommandCreate", () => {
  it("POSTs to the guild-scoped commands endpoint with CHAT_INPUT type", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(201, {
        id: "cmd-1",
        application_id: "app-1",
        guild_id: "guild-1",
        name: "report",
        description: "Generate a status report",
      }),
    );
    const result = await guildCommandCreate({
      applicationId: "app-1",
      guildId: "guild-1",
      name: "report",
      description: "Generate a status report",
    });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe(
      "https://discord.com/api/v10/applications/app-1/guilds/guild-1/commands",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "report",
      description: "Generate a status report",
      type: 1,
    });
    expect(result.id).toBe("cmd-1");
  });

  it("forwards options[] when supplied", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(201, {
        id: "cmd-1",
        application_id: "app-1",
        guild_id: "guild-1",
        name: "ticket",
        description: "Open a ticket",
      }),
    );
    await guildCommandCreate({
      applicationId: "app-1",
      guildId: "guild-1",
      name: "ticket",
      description: "Open a ticket",
      options: [{ name: "subject", type: 3, required: true }],
    });
    const init = mockFetch.mock.calls[0]![1]!;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.options).toEqual([
      { name: "subject", type: 3, required: true },
    ]);
  });

  it("url-encodes path segments (no injection via applicationId / guildId)", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(201, {
        id: "cmd",
        application_id: "a",
        guild_id: "g",
        name: "x",
        description: "x",
      }),
    );
    await guildCommandCreate({
      applicationId: "app/1",
      guildId: "g uild",
      name: "x",
      description: "x",
    });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe(
      "https://discord.com/api/v10/applications/app%2F1/guilds/g%20uild/commands",
    );
  });
});

describe("guildCommandDelete", () => {
  it("DELETEs the specific command and resolves on 204", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      statusText: "",
      headers: new Headers(),
      text: async () => "",
      json: async () => null,
    });
    await expect(
      guildCommandDelete({
        applicationId: "app-1",
        guildId: "guild-1",
        commandId: "cmd-1",
      }),
    ).resolves.toBeUndefined();

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe(
      "https://discord.com/api/v10/applications/app-1/guilds/guild-1/commands/cmd-1",
    );
    expect(init.method).toBe("DELETE");
  });

  it("throws NotFoundError on 404 (caller swallows in best-effort deactivate)", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(404, { code: 10063, message: "Unknown application command" }),
    );
    await expect(
      guildCommandDelete({
        applicationId: "app-1",
        guildId: "guild-1",
        commandId: "cmd-1",
      }),
    ).rejects.toThrow(/not found/);
  });
});
