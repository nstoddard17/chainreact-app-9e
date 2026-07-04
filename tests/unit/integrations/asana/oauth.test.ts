/**
 * @jest-environment node
 *
 * Tests for asanaOAuth — Slice 5.ASANA-1.
 *
 * Strategy mirrors monday/oauth.test.ts (real encryption via a test
 * TOKEN_ENCRYPTION_KEY, fetch mocked at the global boundary). Covers
 * PKCE generation, authorize-URL shape, callback success (embedded
 * identity + /users/me fallback), missing-token failures, refresh
 * preservation policy, and the invalid_grant → RefreshAuthRequiredError
 * mapping. No plaintext token ever appears in the persisted shapes.
 */
import { decryptToken } from "@/core/encryption/tokens";
import { RefreshAuthRequiredError } from "@/contracts/integration";
import { asanaOAuth } from "@/integrations/asana/oauth";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 13) % 256;
  return bytes.toString("base64");
})();

beforeEach(() => {
  process.env.ASANA_CLIENT_ID = "test-asana-client-id";
  process.env.ASANA_CLIENT_SECRET = "test-asana-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.ASANA_CLIENT_ID;
  delete process.env.ASANA_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.ASANA_AUTHORIZE_BASE;
  delete process.env.ASANA_TOKEN_BASE;
  delete process.env.ASANA_API_BASE;
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
  "tasks:read",
  "tasks:write",
  "webhooks:write",
] as const;

const PKCE_IN = { codeVerifier: "verifier-abc", codeChallengeMethod: "S256" };

describe("asanaOAuth.generatePkce", () => {
  it("generates an S256 challenge derived from the verifier", () => {
    const pkce = asanaOAuth.generatePkce!();
    expect(pkce.codeChallengeMethod).toBe("S256");
    expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(pkce.codeChallenge.length).toBeGreaterThan(0);
    expect(pkce.codeChallenge).not.toBe(pkce.codeVerifier);
  });

  it("generates a fresh verifier per call", () => {
    const a = asanaOAuth.generatePkce!();
    const b = asanaOAuth.generatePkce!();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});

describe("asanaOAuth.buildAuthUrl", () => {
  it("uses Asana's authorize endpoint with PKCE + space-joined scopes", () => {
    const url = asanaOAuth.buildAuthUrl("state-xyz", SCOPES, {
      codeChallenge: "chal-1",
      codeChallengeMethod: "S256",
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://app.asana.com");
    expect(parsed.pathname).toBe("/-/oauth_authorize");
    expect(parsed.searchParams.get("client_id")).toBe("test-asana-client-id");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/asana/callback",
    );
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("scope")).toBe(
      "tasks:read tasks:write webhooks:write",
    );
    expect(parsed.searchParams.get("state")).toBe("state-xyz");
    expect(parsed.searchParams.get("code_challenge")).toBe("chal-1");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("throws when the dispatcher failed to thread a PKCE challenge", () => {
    expect(() => asanaOAuth.buildAuthUrl("s", SCOPES, null)).toThrow(
      /PKCE challenge is required/,
    );
  });

  it("honors ASANA_AUTHORIZE_BASE for e2e tests", () => {
    process.env.ASANA_AUTHORIZE_BASE = "https://mock.asana.local";
    const url = asanaOAuth.buildAuthUrl("s", SCOPES, {
      codeChallenge: "c",
      codeChallengeMethod: "S256",
    });
    expect(url.startsWith("https://mock.asana.local/-/oauth_authorize?")).toBe(
      true,
    );
  });
});

describe("asanaOAuth.handleCallback", () => {
  const tokenSuccess = {
    access_token: "at-plain",
    refresh_token: "rt-plain",
    expires_in: 3600,
    token_type: "bearer",
    data: { gid: "1200001", name: "Marcus T", email: "marcus@example.test" },
  };

  it("exchanges the code with body-auth + code_verifier and encrypts tokens", async () => {
    const spy = mockFetchSequence([{ json: tokenSuccess }]);
    const result = await asanaOAuth.handleCallback("code-1", "state", PKCE_IN);

    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe("https://app.asana.com/-/oauth_token");
    const body = new URLSearchParams(String((init as { body?: unknown }).body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe("test-asana-client-id");
    expect(body.get("client_secret")).toBe("test-asana-client-secret");
    expect(body.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/asana/callback",
    );
    expect(body.get("code")).toBe("code-1");
    expect(body.get("code_verifier")).toBe("verifier-abc");

    // Tokens encrypted — decrypt round-trips, ciphertext differs.
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe("at-plain");
    expect(result.tokens.accessTokenEncrypted).not.toContain("at-plain");
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe("rt-plain");
    expect(result.tokens.refreshTokenEncrypted).not.toContain("rt-plain");
    expect(result.tokens.accessTokenExpiresAt).toBeGreaterThan(
      Math.floor(Date.now() / 1000),
    );
  });

  it("resolves identity from the token response's embedded data (no extra fetch)", async () => {
    const spy = mockFetchSequence([{ json: tokenSuccess }]);
    const result = await asanaOAuth.handleCallback("c", "s", PKCE_IN);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.account.providerAccountId).toBe("marcus@example.test");
    expect(result.account.displayName).toBe("Marcus T");
    expect(result.account.metadata).toEqual({
      asanaUserGid: "1200001",
      email: "marcus@example.test",
      name: "Marcus T",
    });
  });

  it("falls back to GET /users/me when the token response has no data object", async () => {
    const spy = mockFetchSequence([
      { json: { ...tokenSuccess, data: undefined } },
      { json: { data: { gid: "1200002", name: "Fallback", email: null } } },
    ]);
    const result = await asanaOAuth.handleCallback("c", "s", PKCE_IN);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(String(spy.mock.calls[1]![0])).toContain("/users/me");
    // No email → falls back to the gid as providerAccountId.
    expect(result.account.providerAccountId).toBe("1200002");
    expect(result.account.displayName).toBe("Fallback");
  });

  it("rejects a token response missing access_token", async () => {
    mockFetchSequence([{ json: { refresh_token: "rt" } }]);
    await expect(
      asanaOAuth.handleCallback("c", "s", PKCE_IN),
    ).rejects.toThrow(/missing access_token/);
  });

  it("rejects a token response missing refresh_token (hourly tokens would strand the row)", async () => {
    mockFetchSequence([
      { json: { ...tokenSuccess, refresh_token: undefined } },
    ]);
    await expect(
      asanaOAuth.handleCallback("c", "s", PKCE_IN),
    ).rejects.toThrow(/missing refresh_token/);
  });

  it("refuses the exchange without a PKCE verifier", async () => {
    await expect(asanaOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /code_verifier/,
    );
  });

  it("surfaces the OAuth error code on a failed exchange without leaking the body", async () => {
    mockFetchSequence([
      { status: 400, json: { error: "invalid_request" } },
    ]);
    await expect(
      asanaOAuth.handleCallback("c", "s", PKCE_IN),
    ).rejects.toThrow(/invalid_request/);
  });
});

describe("asanaOAuth.refreshToken", () => {
  it("refreshes with body-auth and PRESERVES the old refresh token when none is returned", async () => {
    const spy = mockFetchSequence([
      { json: { access_token: "at-new", expires_in: 3600 } },
    ]);
    const tokens = await asanaOAuth.refreshToken("rt-original");

    const body = new URLSearchParams(
      String((spy.mock.calls[0]![1] as { body?: unknown }).body),
    );
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-original");

    expect(decryptToken(tokens.accessTokenEncrypted)).toBe("at-new");
    // Preservation policy: no rotated token in the response → keep original.
    expect(decryptToken(tokens.refreshTokenEncrypted!)).toBe("rt-original");
  });

  it("persists a ROTATED refresh token when the response carries one", async () => {
    mockFetchSequence([
      {
        json: {
          access_token: "at-new",
          refresh_token: "rt-rotated",
          expires_in: 3600,
        },
      },
    ]);
    const tokens = await asanaOAuth.refreshToken("rt-original");
    expect(decryptToken(tokens.refreshTokenEncrypted!)).toBe("rt-rotated");
  });

  it("maps invalid_grant to RefreshAuthRequiredError (dead grant → reconnect)", async () => {
    mockFetchSequence([{ status: 400, json: { error: "invalid_grant" } }]);
    await expect(asanaOAuth.refreshToken("rt-dead")).rejects.toBeInstanceOf(
      RefreshAuthRequiredError,
    );
  });

  it("keeps transient refresh failures generic (no reconnect signal)", async () => {
    mockFetchSequence([{ status: 500, text: "upstream oops" }]);
    await expect(asanaOAuth.refreshToken("rt")).rejects.toThrow(
      /Asana token refresh failed/,
    );
    await expect(async () => {
      mockFetchSequence([{ status: 500, text: "upstream oops" }]);
      await asanaOAuth.refreshToken("rt");
    }).rejects.not.toBeInstanceOf(RefreshAuthRequiredError);
  });
});
