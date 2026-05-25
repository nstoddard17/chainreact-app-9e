/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-3 — Discord users API wrapper.
 */
import { currentBotUser } from "@/integrations/_shared/discord/api/users";

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

describe("currentBotUser", () => {
  it("GETs /users/@me as Bot and returns the parsed body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "",
      headers: new Headers(),
      text: async () => "",
      json: async () => ({ id: "bot-1", username: "ChainReactBot", bot: true }),
    });
    const result = await currentBotUser();
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://discord.com/api/v10/users/@me");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bot bot-token-test");
    expect(result).toEqual({ id: "bot-1", username: "ChainReactBot", bot: true });
  });
});
