/**
 * @jest-environment node
 *
 * Tests for airtableOAuth — V2's first non-Google / non-Microsoft
 * refreshable OAuth provider with rotated refresh tokens. Mocks the
 * global fetch so we don't hit Airtable. Verifies:
 *   - PKCE generation (S256, 43-char base64url verifier).
 *   - Authorize URL includes code_challenge + code_challenge_method.
 *   - Token exchange wire-format: HTTP Basic auth header,
 *     application/x-www-form-urlencoded body, exact body fields.
 *   - /v0/meta/whoami follow-up call resolves providerAccountId.
 *   - Refresh-token ROTATION invariant: throws when the response
 *     omits a new refresh_token (Airtable rotates on every refresh).
 *   - Refresh body includes redirect_uri (V1 quirk:
 *     sendRedirectUriWithRefresh: true).
 */
import { randomBytes } from "node:crypto";
import { airtableOAuth } from "@/integrations/airtable/oauth";
import { decryptToken } from "@/core/encryption/tokens";
import { type PkceChallenge, type PkceInputs } from "@/contracts/integration";

const TOKEN_KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.AIRTABLE_CLIENT_ID = "test-airtable-client-id";
  process.env.AIRTABLE_CLIENT_SECRET = "test-airtable-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.AIRTABLE_CLIENT_ID;
  delete process.env.AIRTABLE_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.AIRTABLE_AUTHORIZE_BASE;
  delete process.env.AIRTABLE_TOKEN_BASE;
  delete process.env.AIRTABLE_API_BASE;
});

function mockFetchSequence(
  responses: Array<{ ok: boolean; status?: number; json?: unknown; text?: string }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    const body = r.text !== undefined ? r.text : JSON.stringify(r.json ?? {});
    spy.mockResolvedValueOnce(
      new Response(body, {
        status: r.status ?? (r.ok ? 200 : 500),
      }),
    );
  }
  return spy;
}

const SCOPES = [
  "data.records:read",
  "data.records:write",
  "schema.bases:read",
  "webhook:manage",
] as const;

const PKCE_CHALLENGE: PkceChallenge = {
  codeChallenge: "fake-airtable-challenge",
  codeChallengeMethod: "S256",
};

const PKCE_INPUTS: PkceInputs = {
  codeVerifier: "verifier-43chars-airtable-test-aaaaaaaaaaaa",
  codeChallengeMethod: "S256",
};

const EXPECTED_BASIC_AUTH = `Basic ${Buffer.from(
  "test-airtable-client-id:test-airtable-client-secret",
).toString("base64")}`;

const EXPECTED_REDIRECT =
  "https://app.example.test/api/integrations/oauth/airtable/callback";

// ─── generatePkce ───────────────────────────────────────────────────────────

describe("airtableOAuth.generatePkce", () => {
  it("returns PKCE with S256 method and a 43-char base64url codeVerifier", () => {
    expect(airtableOAuth.generatePkce).toBeDefined();
    const pkce = airtableOAuth.generatePkce!();
    expect(pkce.codeChallengeMethod).toBe("S256");
    // 32 random bytes → 43 base64url chars (RFC 7636 §4.1 minimum).
    expect(pkce.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // codeChallenge is the base64url-encoded SHA-256 hash → also 43
    // chars (no padding).
    expect(pkce.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("generates distinct codeVerifier on each call (per-flow randomness)", () => {
    const a = airtableOAuth.generatePkce!();
    const b = airtableOAuth.generatePkce!();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
  });
});

// ─── buildAuthUrl ───────────────────────────────────────────────────────────

describe("airtableOAuth.buildAuthUrl", () => {
  it("produces an Airtable authorize URL with all required params + PKCE", () => {
    const url = airtableOAuth.buildAuthUrl("STATE-TOKEN", SCOPES, PKCE_CHALLENGE);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://airtable.com/oauth2/v1/authorize",
    );
    expect(u.searchParams.get("client_id")).toBe("test-airtable-client-id");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("state")).toBe("STATE-TOKEN");
    expect(u.searchParams.get("redirect_uri")).toBe(EXPECTED_REDIRECT);
    expect(u.searchParams.get("code_challenge")).toBe("fake-airtable-challenge");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("requests Airtable's four scopes space-separated", () => {
    const url = airtableOAuth.buildAuthUrl("S", SCOPES, PKCE_CHALLENGE);
    expect(new URL(url).searchParams.get("scope")).toBe(
      "data.records:read data.records:write schema.bases:read webhook:manage",
    );
  });

  it("throws when pkce is null (Airtable requires PKCE)", () => {
    expect(() => airtableOAuth.buildAuthUrl("S", SCOPES, null)).toThrow(/PKCE/);
  });

  it("throws when AIRTABLE_CLIENT_ID is not set", () => {
    delete process.env.AIRTABLE_CLIENT_ID;
    expect(() =>
      airtableOAuth.buildAuthUrl("S", SCOPES, PKCE_CHALLENGE),
    ).toThrow(/AIRTABLE_CLIENT_ID/);
  });

  it("falls back to localhost redirect_uri when NEXT_PUBLIC_APP_URL is not set", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const url = airtableOAuth.buildAuthUrl("S", SCOPES, PKCE_CHALLENGE);
    expect(new URL(url).searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/integrations/oauth/airtable/callback",
    );
  });

  it("uses AIRTABLE_AUTHORIZE_BASE override when set (e2e mock surface)", () => {
    process.env.AIRTABLE_AUTHORIZE_BASE = "http://localhost:9880";
    const url = airtableOAuth.buildAuthUrl("S", SCOPES, PKCE_CHALLENGE);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "http://localhost:9880/oauth2/v1/authorize",
    );
  });

  it("defaults to airtable.com when AIRTABLE_AUTHORIZE_BASE is unset (production-safe)", () => {
    delete process.env.AIRTABLE_AUTHORIZE_BASE;
    const url = airtableOAuth.buildAuthUrl("S", SCOPES, PKCE_CHALLENGE);
    expect(new URL(url).origin).toBe("https://airtable.com");
  });
});

// ─── handleCallback ─────────────────────────────────────────────────────────

describe("airtableOAuth.handleCallback", () => {
  it("posts form-encoded body with HTTP Basic auth + code_verifier to /oauth2/v1/token", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "airtable-access-xyz",
          refresh_token: "airtable-refresh-xyz",
          expires_in: 3600,
          scope:
            "data.records:read data.records:write schema.bases:read webhook:manage",
          token_type: "Bearer",
        },
      },
      {
        ok: true,
        json: {
          id: "usrL2PNC5o3H4lBEi",
          email: "alice@example.com",
          scopes: [
            "data.records:read",
            "data.records:write",
            "schema.bases:read",
            "webhook:manage",
          ],
        },
      },
    ]);

    await airtableOAuth.handleCallback("auth-code-1", "state", PKCE_INPUTS);

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // First call: token exchange.
    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0]!;
    expect(tokenUrl).toBe("https://airtable.com/oauth2/v1/token");
    expect(tokenInit!.method).toBe("POST");
    const headers = tokenInit!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(EXPECTED_BASIC_AUTH);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const params = new URLSearchParams(tokenInit!.body as string);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("auth-code-1");
    expect(params.get("redirect_uri")).toBe(EXPECTED_REDIRECT);
    expect(params.get("code_verifier")).toBe(PKCE_INPUTS.codeVerifier);
    // Body should NOT carry client_id/client_secret — those are in the
    // Basic auth header.
    expect(params.get("client_id")).toBeNull();
    expect(params.get("client_secret")).toBeNull();
  });

  it("calls /v0/meta/whoami with the new access token after token exchange", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "fresh-access",
          refresh_token: "fresh-refresh",
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
      { ok: true, json: { id: "usrXXX", email: "x@y.com" } },
    ]);

    await airtableOAuth.handleCallback("c", "s", PKCE_INPUTS);

    const [whoamiUrl, whoamiInit] = fetchSpy.mock.calls[1]!;
    expect(whoamiUrl).toBe("https://api.airtable.com/v0/meta/whoami");
    expect(whoamiInit!.method).toBe("GET");
    expect(whoamiInit!.headers).toEqual({
      Authorization: "Bearer fresh-access",
    });
  });

  it("encrypts both access and refresh tokens; decrypt round-trips", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "real-access-xyz",
          refresh_token: "real-refresh-xyz",
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
      { ok: true, json: { id: "usrXXX" } },
    ]);

    const result = await airtableOAuth.handleCallback("c", "s", PKCE_INPUTS);

    expect(result.tokens.accessTokenEncrypted).not.toContain("real-access-xyz");
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(
      "real-access-xyz",
    );
    expect(result.tokens.refreshTokenEncrypted).not.toBeNull();
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe(
      "real-refresh-xyz",
    );
  });

  it("populates accessTokenExpiresAt from expires_in (epoch seconds)", async () => {
    const before = Math.floor(Date.now() / 1000);
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
      { ok: true, json: { id: "usrXXX" } },
    ]);
    const result = await airtableOAuth.handleCallback("c", "s", PKCE_INPUTS);
    const after = Math.floor(Date.now() / 1000);
    // Access token TTL is 60 minutes — Airtable's documented default.
    expect(result.tokens.accessTokenExpiresAt).toBeGreaterThanOrEqual(before + 3600);
    expect(result.tokens.accessTokenExpiresAt).toBeLessThanOrEqual(after + 3600);
  });

  it("splits scope string on space (Airtable's wire format)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 3600,
          scope:
            "data.records:read data.records:write schema.bases:read webhook:manage",
        },
      },
      { ok: true, json: { id: "usrXXX" } },
    ]);
    const result = await airtableOAuth.handleCallback("c", "s", PKCE_INPUTS);
    expect(result.tokens.scopes).toEqual([
      "data.records:read",
      "data.records:write",
      "schema.bases:read",
      "webhook:manage",
    ]);
  });

  it("populates accountInfo from /v0/meta/whoami id + email", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
      {
        ok: true,
        json: {
          id: "usrL2PNC5o3H4lBEi",
          email: "alice@example.com",
          scopes: ["data.records:read", "webhook:manage"],
        },
      },
    ]);
    const result = await airtableOAuth.handleCallback("c", "s", PKCE_INPUTS);
    expect(result.account.providerAccountId).toBe("usrL2PNC5o3H4lBEi");
    expect(result.account.displayName).toBe("alice@example.com");
    expect(result.account.metadata).toEqual({
      userId: "usrL2PNC5o3H4lBEi",
      email: "alice@example.com",
      scopesGranted: ["data.records:read", "webhook:manage"],
    });
  });

  it("falls back displayName to userId when whoami omits email", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
      { ok: true, json: { id: "usrNoEmail" } },
    ]);
    const result = await airtableOAuth.handleCallback("c", "s", PKCE_INPUTS);
    expect(result.account.providerAccountId).toBe("usrNoEmail");
    expect(result.account.displayName).toBe("usrNoEmail");
    const meta = result.account.metadata as Record<string, unknown>;
    expect(meta.email).toBeNull();
    expect(meta.scopesGranted).toEqual([]);
  });

  it("throws on token-exchange HTTP failure with parsed error code", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: { error: "invalid_grant", error_description: "bad code" },
      },
    ]);
    await expect(
      airtableOAuth.handleCallback("bad-code", "s", PKCE_INPUTS),
    ).rejects.toThrow(/Airtable token exchange failed: invalid_grant/);
  });

  it("falls back to HTTP <status> when error response is not JSON", async () => {
    mockFetchSequence([{ ok: false, status: 502, text: "Bad Gateway" }]);
    await expect(
      airtableOAuth.handleCallback("c", "s", PKCE_INPUTS),
    ).rejects.toThrow(/Airtable token exchange failed: HTTP 502/);
  });

  it("throws when AIRTABLE_CLIENT_SECRET is missing", async () => {
    delete process.env.AIRTABLE_CLIENT_SECRET;
    await expect(
      airtableOAuth.handleCallback("c", "s", PKCE_INPUTS),
    ).rejects.toThrow(/AIRTABLE_CLIENT_SECRET/);
  });

  it("throws when token response is missing access_token", async () => {
    mockFetchSequence([
      { ok: true, json: { refresh_token: "x", expires_in: 3600 } },
    ]);
    await expect(
      airtableOAuth.handleCallback("c", "s", PKCE_INPUTS),
    ).rejects.toThrow(/missing access_token/);
  });

  it("throws when token response is missing refresh_token", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          // No refresh_token — Airtable always issues one.
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
    ]);
    await expect(
      airtableOAuth.handleCallback("c", "s", PKCE_INPUTS),
    ).rejects.toThrow(/missing refresh_token/);
  });

  it("throws when whoami response is missing id", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
      { ok: true, json: { email: "no-id@example.com" } },
    ]);
    await expect(
      airtableOAuth.handleCallback("c", "s", PKCE_INPUTS),
    ).rejects.toThrow(/whoami response missing id/);
  });

  it("throws on whoami HTTP failure", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
      { ok: false, status: 401, text: "Unauthorized" },
    ]);
    await expect(
      airtableOAuth.handleCallback("c", "s", PKCE_INPUTS),
    ).rejects.toThrow(/whoami failed: HTTP 401/);
  });

  it("throws when pkce is null", async () => {
    await expect(
      airtableOAuth.handleCallback("c", "s", null),
    ).rejects.toThrow(/PKCE code_verifier is required/);
  });

  it("throws when pkce.codeVerifier is empty", async () => {
    await expect(
      airtableOAuth.handleCallback("c", "s", {
        codeVerifier: "",
        codeChallengeMethod: "S256",
      }),
    ).rejects.toThrow(/PKCE code_verifier is required/);
  });

  it("uses AIRTABLE_TOKEN_BASE override for the token exchange (e2e mock surface)", async () => {
    process.env.AIRTABLE_TOKEN_BASE = "http://localhost:9880";
    process.env.AIRTABLE_API_BASE = "http://localhost:9880";
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
      { ok: true, json: { id: "usrXXX" } },
    ]);
    await airtableOAuth.handleCallback("c", "s", PKCE_INPUTS);
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://localhost:9880/oauth2/v1/token",
    );
    expect(fetchSpy.mock.calls[1]![0]).toBe(
      "http://localhost:9880/v0/meta/whoami",
    );
  });
});

// ─── refreshToken (rotation invariant) ──────────────────────────────────────

describe("airtableOAuth.refreshToken — rotation contract", () => {
  it("posts Basic auth + form body with grant_type=refresh_token + refresh_token + redirect_uri", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "rotated-access-1",
          refresh_token: "rotated-refresh-1",
          expires_in: 3600,
          scope:
            "data.records:read data.records:write schema.bases:read webhook:manage",
        },
      },
    ]);

    await airtableOAuth.refreshToken("original-refresh-token");

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://airtable.com/oauth2/v1/token");
    expect(init!.method).toBe("POST");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(EXPECTED_BASIC_AUTH);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const params = new URLSearchParams(init!.body as string);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("original-refresh-token");
    // Per V1 quirk: Airtable requires redirect_uri on the refresh body
    // (sendRedirectUriWithRefresh: true).
    expect(params.get("redirect_uri")).toBe(EXPECTED_REDIRECT);
    expect(params.get("client_id")).toBeNull();
    expect(params.get("client_secret")).toBeNull();
  });

  it("PERSISTS the new refresh_token (rotation: each refresh issues a new one)", async () => {
    // Load-bearing test for V2's refresh-token rotation contract.
    // V1's `dispatcher.refresh` → `updateTokens` flow already
    // persists refresh_token_encrypted; this test asserts that the
    // per-provider refreshToken() returns the NEW refresh token
    // encrypted (not the old one re-encrypted).
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "rotated-access",
          refresh_token: "BRAND-NEW-REFRESH-TOKEN",
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
    ]);

    const result = await airtableOAuth.refreshToken("OLD-INVALID-TOKEN");

    // The encrypted ciphertext must decrypt back to the NEW token,
    // not the old one (which Airtable has invalidated).
    expect(decryptToken(result.refreshTokenEncrypted!)).toBe(
      "BRAND-NEW-REFRESH-TOKEN",
    );
    expect(decryptToken(result.refreshTokenEncrypted!)).not.toBe(
      "OLD-INVALID-TOKEN",
    );
    expect(decryptToken(result.accessTokenEncrypted)).toBe("rotated-access");
  });

  it("THROWS rotation-invariant violation when refresh_token is missing from response", async () => {
    // Airtable rotates on every successful refresh. If the response
    // is missing a new refresh_token, the rotation contract was
    // violated. V2 fails LOUD rather than re-encrypting the old
    // (now-invalid) token — which would silently break every
    // subsequent refresh.
    //
    // This is the load-bearing rotation test that distinguishes
    // Airtable from Google/Microsoft (preserve-old policy).
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "new-access",
          // No refresh_token — rotation invariant violation.
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
    ]);

    await expect(
      airtableOAuth.refreshToken("original-refresh"),
    ).rejects.toThrow(/missing refresh_token/);
  });

  it("does NOT re-encrypt the input refresh token when rotation invariant is violated (anti-preserve-old)", async () => {
    // Anti-test for the Google/Microsoft preserve-old behavior. If
    // the refresh response omits refresh_token, Airtable's V2 oauth
    // module MUST throw — never returning a payload that re-encrypts
    // the input plaintext (which would mask token invalidation).
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "new-access",
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
    ]);

    let result: unknown;
    let threw = false;
    try {
      result = await airtableOAuth.refreshToken("INPUT-REFRESH-TOKEN");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(result).toBeUndefined();
  });

  it("encrypts the new access_token; decrypt round-trips", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "real-rotated-access",
          refresh_token: "real-rotated-refresh",
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
    ]);
    const result = await airtableOAuth.refreshToken("any");
    expect(result.accessTokenEncrypted).not.toContain("real-rotated-access");
    expect(decryptToken(result.accessTokenEncrypted)).toBe(
      "real-rotated-access",
    );
  });

  it("populates accessTokenExpiresAt from expires_in", async () => {
    const before = Math.floor(Date.now() / 1000);
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "a",
          refresh_token: "b",
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
    ]);
    const result = await airtableOAuth.refreshToken("any");
    const after = Math.floor(Date.now() / 1000);
    expect(result.accessTokenExpiresAt).toBeGreaterThanOrEqual(before + 3600);
    expect(result.accessTokenExpiresAt).toBeLessThanOrEqual(after + 3600);
  });

  it("throws on refresh HTTP failure with parsed error code (invalid_grant → reconnect)", async () => {
    // V1's tokenRefreshService.ts:389-394 surfaces "Airtable refresh
    // token expired or invalid" on invalid_grant. V2's
    // refreshAndRetry catches the thrown Error and translates to
    // IntegrationActionRequiredError(reason: "refresh_failed").
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: { error: "invalid_grant" },
      },
    ]);
    await expect(airtableOAuth.refreshToken("expired-token")).rejects.toThrow(
      /Airtable token refresh failed: invalid_grant/,
    );
  });

  it("falls back to HTTP <status> when refresh error response is not JSON", async () => {
    mockFetchSequence([{ ok: false, status: 503, text: "Service Unavailable" }]);
    await expect(airtableOAuth.refreshToken("any")).rejects.toThrow(
      /Airtable token refresh failed: HTTP 503/,
    );
  });

  it("throws when refresh response is missing access_token", async () => {
    mockFetchSequence([
      { ok: true, json: { refresh_token: "x", expires_in: 3600 } },
    ]);
    await expect(airtableOAuth.refreshToken("any")).rejects.toThrow(
      /refresh response missing access_token/,
    );
  });

  it("uses AIRTABLE_TOKEN_BASE override for refresh (e2e mock surface)", async () => {
    process.env.AIRTABLE_TOKEN_BASE = "http://localhost:9880";
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 3600,
          scope: "data.records:read",
        },
      },
    ]);
    await airtableOAuth.refreshToken("any");
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://localhost:9880/oauth2/v1/token",
    );
  });
});

// ─── revoke ─────────────────────────────────────────────────────────────────

describe("airtableOAuth.revoke", () => {
  it("is a no-op stub (matches every other V2 provider's deferred-disconnect-UX pattern)", async () => {
    await expect(airtableOAuth.revoke("any-token")).resolves.toBeUndefined();
  });
});
