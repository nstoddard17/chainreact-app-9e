/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-2 — Discord OAuth (identity-only) wiring tests.
 */
const mockEncryptToken = jest.fn();
jest.mock("@/core/encryption/tokens", () => ({
  encryptToken: (...args: unknown[]) => mockEncryptToken(...args),
}));

const mockFetch = jest.fn();
const originalFetch = global.fetch;

import { discordOAuth } from "@/integrations/discord/oauth";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  mockEncryptToken.mockReset();
  mockEncryptToken.mockImplementation((t: string) => `ENC(${t})`);
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  process.env.DISCORD_CLIENT_ID = "client-abc";
  process.env.DISCORD_CLIENT_SECRET = "secret-xyz";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  delete process.env.DISCORD_AUTHORIZE_BASE;
  delete process.env.DISCORD_TOKEN_BASE;
  delete process.env.DISCORD_API_BASE;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = originalFetch;
});

describe("discordOAuth.buildAuthUrl", () => {
  it("builds the Discord authorize URL with space-joined scopes + state + prompt=consent", () => {
    const url = discordOAuth.buildAuthUrl(
      "state-token-abc",
      ["identify", "email", "bot", "guilds"],
      null,
      null,
    );
    expect(url).toContain("https://discord.com/oauth2/authorize?");
    expect(url).toContain("client_id=client-abc");
    expect(url).toContain("response_type=code");
    // Scope must be space-joined for Discord (`+` is URL-encoded space).
    expect(url).toMatch(/scope=identify(\+|%20)email(\+|%20)bot(\+|%20)guilds/);
    expect(url).toContain("state=state-token-abc");
    expect(url).toContain(
      "redirect_uri=https%3A%2F%2Fapp.example.com%2Fapi%2Fintegrations%2Foauth%2Fdiscord%2Fcallback",
    );
    expect(url).toContain("prompt=consent");
  });

  it("respects DISCORD_AUTHORIZE_BASE for e2e overrides", () => {
    process.env.DISCORD_AUTHORIZE_BASE = "http://localhost:9999";
    const url = discordOAuth.buildAuthUrl("s", ["identify"], null, null);
    expect(url.startsWith("http://localhost:9999/oauth2/authorize?")).toBe(true);
  });

  it("throws when DISCORD_CLIENT_ID is unset", () => {
    delete process.env.DISCORD_CLIENT_ID;
    expect(() => discordOAuth.buildAuthUrl("s", ["identify"], null, null)).toThrow(
      /DISCORD_CLIENT_ID/,
    );
  });
});

describe("discordOAuth.handleCallback", () => {
  function mockTokenAndIdentity(
    token: Record<string, unknown>,
    identity: Record<string, unknown>,
  ) {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => token,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => identity,
      });
  }

  it("exchanges code, encrypts both tokens, fetches identity, returns account info", async () => {
    mockTokenAndIdentity(
      {
        access_token: "user-access",
        refresh_token: "user-refresh",
        token_type: "Bearer",
        expires_in: 604800, // 7 days
        scope: "identify email bot guilds",
      },
      {
        id: "discord-user-123",
        username: "alice",
        global_name: "Alice",
        discriminator: "0001",
        avatar: "avatar-hash",
        email: "alice@example.com",
      },
    );

    const result = await discordOAuth.handleCallback("code-abc", "state-xyz", null, null);

    // Token-exchange call: POST to discord.com /api/v10/oauth2/token, form-encoded.
    const [tokenUrl, tokenInit] = mockFetch.mock.calls[0]!;
    expect(tokenUrl).toBe("https://discord.com/api/v10/oauth2/token");
    expect(tokenInit.method).toBe("POST");
    expect(tokenInit.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(tokenInit.body).toContain("grant_type=authorization_code");
    expect(tokenInit.body).toContain("code=code-abc");
    expect(tokenInit.body).toContain("client_secret=secret-xyz");

    // Identity call: GET /api/v10/users/@me with Bearer.
    const [identityUrl, identityInit] = mockFetch.mock.calls[1]!;
    expect(identityUrl).toBe("https://discord.com/api/v10/users/@me");
    expect(identityInit.headers.Authorization).toBe("Bearer user-access");

    // Tokens — encrypted via the mock, expires_at derived from expires_in.
    expect(result.tokens.accessTokenEncrypted).toBe("ENC(user-access)");
    expect(result.tokens.refreshTokenEncrypted).toBe("ENC(user-refresh)");
    expect(result.tokens.scopes).toEqual(["identify", "email", "bot", "guilds"]);
    expect(result.tokens.accessTokenExpiresAt).not.toBeNull();
    expect(typeof result.tokens.accessTokenExpiresAt).toBe("number");

    // Account — picks global_name over username over email.
    expect(result.account.providerAccountId).toBe("discord-user-123");
    expect(result.account.displayName).toBe("Alice");
    expect(result.account.metadata).toMatchObject({
      userId: "discord-user-123",
      username: "alice",
      globalName: "Alice",
      email: "alice@example.com",
    });
  });

  it("falls back to username when global_name is null", async () => {
    mockTokenAndIdentity(
      {
        access_token: "t",
        refresh_token: "r",
        token_type: "Bearer",
        expires_in: 60,
        scope: "identify",
      },
      { id: "u1", username: "bob", global_name: null, email: null },
    );
    const result = await discordOAuth.handleCallback("c", "s", null, null);
    expect(result.account.displayName).toBe("bob");
  });

  it("throws on non-2xx token exchange", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) });
    await expect(discordOAuth.handleCallback("c", "s", null, null)).rejects.toThrow(
      /token exchange failed: HTTP 400/,
    );
  });

  it("throws on Discord OAuth error envelope", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ error: "invalid_grant" }),
    });
    await expect(discordOAuth.handleCallback("c", "s", null, null)).rejects.toThrow(
      /Discord OAuth error: invalid_grant/,
    );
  });
});

describe("discordOAuth.refreshToken", () => {
  it("calls /oauth2/token with grant_type=refresh_token and returns fresh encrypted tokens", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "fresh-access",
        refresh_token: "fresh-refresh",
        token_type: "Bearer",
        expires_in: 604800,
        scope: "identify email bot guilds",
      }),
    });

    const tokens = await discordOAuth.refreshToken("old-refresh");

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://discord.com/api/v10/oauth2/token");
    expect(init.body).toContain("grant_type=refresh_token");
    expect(init.body).toContain("refresh_token=old-refresh");

    expect(tokens.accessTokenEncrypted).toBe("ENC(fresh-access)");
    expect(tokens.refreshTokenEncrypted).toBe("ENC(fresh-refresh)");
    expect(tokens.scopes).toEqual(["identify", "email", "bot", "guilds"]);
  });

  it("throws on non-2xx refresh response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    await expect(discordOAuth.refreshToken("old")).rejects.toThrow(
      /token refresh failed: HTTP 401/,
    );
  });

  it("V2-READY-32 — invalid_grant body throws typed RefreshAuthRequiredError (reconnect)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_grant" }),
    });
    await expect(discordOAuth.refreshToken("old")).rejects.toMatchObject({
      name: "RefreshAuthRequiredError",
      code: "invalid_grant",
    });
  });
});

describe("discordOAuth.revoke", () => {
  it("is best-effort and resolves without throwing (deferred implementation)", async () => {
    await expect(discordOAuth.revoke("any-token")).resolves.toBeUndefined();
  });
});
