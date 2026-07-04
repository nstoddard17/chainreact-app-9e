/**
 * @jest-environment node
 *
 * Tests for typeformOAuth — Slice 5.TYPEFORM-1.
 *
 * Strategy mirrors asana/oauth.test.ts (real encryption via a test
 * TOKEN_ENCRYPTION_KEY, fetch mocked at the global boundary). Covers the
 * NO-PKCE authorize-URL shape, callback success (identity via GET /me),
 * missing refresh_token fail-fast, refresh-token ROTATION persistence,
 * and the invalid_grant → RefreshAuthRequiredError mapping. No plaintext
 * token ever appears in the persisted shapes.
 */
import { decryptToken } from "@/core/encryption/tokens";
import { RefreshAuthRequiredError } from "@/contracts/integration";
import { typeformOAuth } from "@/integrations/typeform/oauth";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 17) % 256;
  return bytes.toString("base64");
})();

beforeEach(() => {
  process.env.TYPEFORM_CLIENT_ID = "test-typeform-client-id";
  process.env.TYPEFORM_CLIENT_SECRET = "test-typeform-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.TYPEFORM_CLIENT_ID;
  delete process.env.TYPEFORM_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.TYPEFORM_AUTHORIZE_BASE;
  delete process.env.TYPEFORM_TOKEN_BASE;
  delete process.env.TYPEFORM_API_BASE;
});

function mockFetchSequence(
  responses: Array<{ status?: number; json?: unknown; text?: string }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    const status = r.status ?? 200;
    if (r.text !== undefined) {
      spy.mockResolvedValueOnce(new Response(r.text, { status }));
    } else {
      spy.mockResolvedValueOnce(
        new Response(JSON.stringify(r.json), { status }),
      );
    }
  }
  return spy;
}

const SCOPES = [
  "accounts:read",
  "forms:read",
  "webhooks:write",
  "offline",
] as const;

describe("typeformOAuth — no PKCE (confidential client)", () => {
  it("does not declare generatePkce", () => {
    expect(typeformOAuth.generatePkce).toBeUndefined();
  });
});

describe("typeformOAuth.buildAuthUrl", () => {
  it("uses Typeform's authorize endpoint with space-joined scopes and NO code_challenge", () => {
    const url = typeformOAuth.buildAuthUrl("state-xyz", SCOPES, null, null);
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://api.typeform.com");
    expect(parsed.pathname).toBe("/oauth/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("test-typeform-client-id");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/typeform/callback",
    );
    expect(parsed.searchParams.get("scope")).toBe(
      "accounts:read forms:read webhooks:write offline",
    );
    expect(parsed.searchParams.get("state")).toBe("state-xyz");
    expect(parsed.searchParams.get("code_challenge")).toBeNull();
    // The client secret NEVER appears in the browser-visible URL.
    expect(url).not.toContain("test-typeform-client-secret");
  });

  it("honors the TYPEFORM_AUTHORIZE_BASE e2e override", () => {
    process.env.TYPEFORM_AUTHORIZE_BASE = "http://localhost:9999";
    const url = typeformOAuth.buildAuthUrl("s", SCOPES, null, null);
    expect(url.startsWith("http://localhost:9999/oauth/authorize?")).toBe(true);
  });
});

describe("typeformOAuth.handleCallback", () => {
  const tokenSuccess = {
    token_type: "Bearer",
    access_token: "tf-access-1",
    refresh_token: "tf-refresh-1",
    expires_in: 604800,
  };
  const meSuccess = {
    alias: "Marcus",
    email: "marcus@example.test",
    language: "en",
    user_id: "01F0000000000000000000",
  };

  it("exchanges the code (client_secret in the BODY), resolves identity via /me, encrypts tokens", async () => {
    const spy = mockFetchSequence([
      { json: tokenSuccess },
      { json: meSuccess },
    ]);

    const result = await typeformOAuth.handleCallback("code-1", "state", null, null);

    // Token exchange wire shape.
    const [tokenUrl, tokenInit] = spy.mock.calls[0]!;
    expect(String(tokenUrl)).toBe("https://api.typeform.com/oauth/token");
    const body = new URLSearchParams(String((tokenInit as { body?: unknown }).body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe("test-typeform-client-id");
    expect(body.get("client_secret")).toBe("test-typeform-client-secret");
    expect(body.get("code")).toBe("code-1");
    expect(body.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/typeform/callback",
    );
    // No PKCE verifier field.
    expect(body.get("code_verifier")).toBeNull();

    // /me identity call with the fresh access token.
    const [meUrl, meInit] = spy.mock.calls[1]!;
    expect(String(meUrl)).toBe("https://api.typeform.com/me");
    expect(
      (meInit as { headers?: unknown }).headers as Record<string, string>,
    ).toMatchObject({ Authorization: "Bearer tf-access-1" });

    // Persisted shape: tokens encrypted, identity mapped.
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe("tf-access-1");
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe("tf-refresh-1");
    expect(result.tokens.accessTokenExpiresAt).toBeGreaterThan(
      Math.floor(Date.now() / 1000),
    );
    expect(result.account.providerAccountId).toBe("marcus@example.test");
    expect(result.account.displayName).toBe("Marcus");
    expect(result.account.metadata).toMatchObject({
      typeformUserId: "01F0000000000000000000",
      email: "marcus@example.test",
    });

    // No plaintext token in the persisted payload.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("tf-access-1");
    expect(serialized).not.toContain("tf-refresh-1");
  });

  it("falls back to user_id as providerAccountId when /me has no email", async () => {
    mockFetchSequence([
      { json: tokenSuccess },
      { json: { ...meSuccess, email: null, alias: null } },
    ]);
    const result = await typeformOAuth.handleCallback("c", "s", null, null);
    expect(result.account.providerAccountId).toBe("01F0000000000000000000");
    expect(result.account.displayName).toBe("01F0000000000000000000");
  });

  it("fails the connect when refresh_token is missing (offline scope not granted)", async () => {
    mockFetchSequence([
      { json: { ...tokenSuccess, refresh_token: undefined } },
    ]);
    await expect(
      typeformOAuth.handleCallback("c", "s", null, null),
    ).rejects.toThrow(/refresh_token/);
  });

  it("surfaces a sanitized error on a failed exchange (no raw body)", async () => {
    mockFetchSequence([
      {
        status: 400,
        json: { error: "invalid_grant", error_description: "Code expired" },
      },
    ]);
    await expect(
      typeformOAuth.handleCallback("c", "s", null, null),
    ).rejects.toThrow(/invalid_grant/);
  });

  it("fails when /me lookup fails", async () => {
    mockFetchSequence([{ json: tokenSuccess }, { status: 500, text: "boom" }]);
    await expect(
      typeformOAuth.handleCallback("c", "s", null, null),
    ).rejects.toThrow(/\/me lookup failed/);
  });
});

describe("typeformOAuth.refreshToken — rotation", () => {
  it("persists the ROTATED refresh token (old one is invalidated provider-side)", async () => {
    mockFetchSequence([
      {
        json: {
          access_token: "tf-access-2",
          refresh_token: "tf-refresh-2",
          expires_in: 604800,
        },
      },
    ]);
    const tokens = await typeformOAuth.refreshToken("tf-refresh-1");
    expect(decryptToken(tokens.accessTokenEncrypted)).toBe("tf-access-2");
    expect(decryptToken(tokens.refreshTokenEncrypted!)).toBe("tf-refresh-2");
  });

  it("keeps the original refresh token only when the response omits one (defensive)", async () => {
    mockFetchSequence([
      { json: { access_token: "tf-access-2", expires_in: 604800 } },
    ]);
    const tokens = await typeformOAuth.refreshToken("tf-refresh-1");
    expect(decryptToken(tokens.refreshTokenEncrypted!)).toBe("tf-refresh-1");
  });

  it("maps invalid_grant to RefreshAuthRequiredError (needs-reconnect exactly once)", async () => {
    mockFetchSequence([
      { status: 400, json: { error: "invalid_grant" } },
    ]);
    await expect(typeformOAuth.refreshToken("dead")).rejects.toBeInstanceOf(
      RefreshAuthRequiredError,
    );
  });

  it("throws a plain error on non-auth refresh failures", async () => {
    mockFetchSequence([{ status: 500, text: "oops" }]);
    await expect(typeformOAuth.refreshToken("r")).rejects.toThrow(
      /token refresh failed/,
    );
  });
});
