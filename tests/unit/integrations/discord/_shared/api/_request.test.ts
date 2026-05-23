/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-2 — Shared Discord bot-request wrapper.
 */
import { discordBotRequest } from "@/integrations/_shared/discord/api/_request";
import {
  DiscordApiError,
  DiscordBotTokenMissingError,
  NotFoundError,
} from "@/integrations/_shared/discord/errors";

const mockFetch = jest.fn();
const originalFetch = global.fetch;
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  process.env.DISCORD_BOT_TOKEN = "bot-token-deadbeef";
  delete process.env.DISCORD_API_BASE;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = originalFetch;
});

function jsonResponse(status: number, body: unknown, init: Partial<Response> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: new Headers(),
    text: async () => JSON.stringify(body),
    json: async () => body,
    ...init,
  };
}

describe("discordBotRequest — auth + URL construction", () => {
  it("sends Authorization: Bot <token> and the pinned /api/v10/ path", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: "abc" }));

    await discordBotRequest({
      method: "GET",
      path: "/channels/123/messages/456",
      resourceForNotFound: "message 456",
    });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://discord.com/api/v10/channels/123/messages/456");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bot bot-token-deadbeef");
    expect(init.headers.Accept).toBe("application/json");
    // No Content-Type when there is no body.
    expect(init.headers["Content-Type"]).toBeUndefined();
  });

  it("normalizes leading-slash absence", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await discordBotRequest({
      method: "GET",
      path: "users/@me",
      resourceForNotFound: "users/@me",
    });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://discord.com/api/v10/users/@me");
  });

  it("honors DISCORD_API_BASE override for e2e", async () => {
    process.env.DISCORD_API_BASE = "http://localhost:9999";
    mockFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await discordBotRequest({
      method: "GET",
      path: "/anything",
      resourceForNotFound: "anything",
    });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:9999/api/v10/anything");
  });

  it("attaches a JSON body + Content-Type when body is provided", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await discordBotRequest({
      method: "POST",
      path: "/channels/1/messages",
      body: { content: "hi" },
      resourceForNotFound: "channel 1",
    });
    const init = mockFetch.mock.calls[0]![1];
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ content: "hi" }));
  });

  it("appends query params when provided", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, []));
    const query = new URLSearchParams({ limit: "50", before: "999" });
    await discordBotRequest({
      method: "GET",
      path: "/channels/1/messages",
      query,
      resourceForNotFound: "channel 1",
    });
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe(
      "https://discord.com/api/v10/channels/1/messages?limit=50&before=999",
    );
  });

  it("attaches X-Audit-Log-Reason when supplied", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(204, null));
    await discordBotRequest({
      method: "DELETE",
      path: "/channels/1/messages/2",
      resourceForNotFound: "message 2",
      auditLogReason: "workflow-driven cleanup",
    });
    const init = mockFetch.mock.calls[0]![1];
    expect(init.headers["X-Audit-Log-Reason"]).toBe("workflow-driven cleanup");
  });
});

describe("discordBotRequest — token resolution", () => {
  it("throws DiscordBotTokenMissingError when DISCORD_BOT_TOKEN is unset", async () => {
    delete process.env.DISCORD_BOT_TOKEN;
    await expect(
      discordBotRequest({
        method: "GET",
        path: "/users/@me",
        resourceForNotFound: "users/@me",
      }),
    ).rejects.toBeInstanceOf(DiscordBotTokenMissingError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws DiscordBotTokenMissingError when DISCORD_BOT_TOKEN is empty string", async () => {
    process.env.DISCORD_BOT_TOKEN = "";
    await expect(
      discordBotRequest({
        method: "GET",
        path: "/users/@me",
        resourceForNotFound: "users/@me",
      }),
    ).rejects.toBeInstanceOf(DiscordBotTokenMissingError);
  });

  it("never logs the bot token in error messages", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(401, { code: 0, message: "Unauthorized" }));
    let caught: Error | null = null;
    try {
      await discordBotRequest({
        method: "GET",
        path: "/users/@me",
        resourceForNotFound: "users/@me",
      });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeInstanceOf(DiscordApiError);
    expect(caught!.message).not.toContain("bot-token-deadbeef");
  });
});

describe("discordBotRequest — response mapping", () => {
  it("returns parsed JSON on 2xx", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { id: "m1", content: "hi" }));
    const result = await discordBotRequest<{ id: string; content: string }>({
      method: "GET",
      path: "/channels/1/messages/m1",
      resourceForNotFound: "message m1",
    });
    expect(result).toEqual({ id: "m1", content: "hi" });
  });

  it("returns null on 204 No Content", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      statusText: "",
      headers: new Headers(),
      text: async () => "",
      json: async () => null,
    });
    const result = await discordBotRequest({
      method: "DELETE",
      path: "/channels/1/messages/m1",
      resourceForNotFound: "message m1",
    });
    expect(result).toBeNull();
  });

  it("throws NotFoundError on 404 with the supplied resource label", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(404, { code: 10003, message: "Unknown Channel" }),
    );
    await expect(
      discordBotRequest({
        method: "GET",
        path: "/channels/99/messages",
        resourceForNotFound: "channel 99",
      }),
    ).rejects.toMatchObject({
      name: "NotFoundError",
      resource: "channel 99",
    });
  });

  it("throws DiscordApiError on 403 with Discord error code preserved", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(403, {
        code: 50013,
        message: "Missing Permissions",
      }),
    );
    let err: unknown;
    try {
      await discordBotRequest({
        method: "POST",
        path: "/channels/1/messages",
        body: { content: "hi" },
        resourceForNotFound: "channel 1",
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DiscordApiError);
    expect((err as DiscordApiError).status).toBe(403);
    expect((err as DiscordApiError).code).toBe(50013);
    expect((err as DiscordApiError).message).toContain("Missing Permissions");
  });

  it("throws DiscordApiError on 429 (rate limited) — no auto-retry", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(429, { message: "You are being rate limited.", retry_after: 1 }),
    );
    let err: unknown;
    try {
      await discordBotRequest({
        method: "POST",
        path: "/channels/1/messages",
        body: { content: "x" },
        resourceForNotFound: "channel 1",
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DiscordApiError);
    expect((err as DiscordApiError).status).toBe(429);
  });
});

describe("DiscordApiError + NotFoundError + DiscordBotTokenMissingError shape", () => {
  it("DiscordApiError carries status + code + message", () => {
    const err = new DiscordApiError(403, 50005, "Cannot edit a message authored by another user");
    expect(err.name).toBe("DiscordApiError");
    expect(err.status).toBe(403);
    expect(err.code).toBe(50005);
    expect(err.message).toContain("Cannot edit");
  });

  it("NotFoundError carries the resource label", () => {
    const err = new NotFoundError("channel 99", "Unknown Channel");
    expect(err.name).toBe("NotFoundError");
    expect(err.resource).toBe("channel 99");
  });

  it("DiscordBotTokenMissingError carries a clear operator-facing message", () => {
    const err = new DiscordBotTokenMissingError();
    expect(err.name).toBe("DiscordBotTokenMissingError");
    expect(err.message).toContain("DISCORD_BOT_TOKEN");
  });
});
