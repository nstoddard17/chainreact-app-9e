/**
 * @jest-environment node
 *
 * Tests for calendlyOAuth — Slice 5.CALENDLY-1.
 *
 * Strategy mirrors asana/typeform oauth tests (real encryption via a
 * test TOKEN_ENCRYPTION_KEY, fetch mocked at the global boundary).
 * Covers the PKCE S256 authorize-URL shape, Basic-auth token exchange,
 * callback success (identity via GET /users/me; user/org URIs persisted
 * to account metadata), missing refresh_token fail-fast, refresh-token
 * ROTATION persistence, and the invalid_grant → RefreshAuthRequiredError
 * mapping. No plaintext token or client secret ever appears in the
 * persisted shapes or the browser-visible URL.
 */
import { decryptToken } from "@/core/encryption/tokens";
import { RefreshAuthRequiredError } from "@/contracts/integration";
import { calendlyOAuth, calendlyUuidFromUri } from "@/integrations/calendly/oauth";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 256;
  return bytes.toString("base64");
})();

beforeEach(() => {
  process.env.CALENDLY_CLIENT_ID = "test-calendly-client-id";
  process.env.CALENDLY_CLIENT_SECRET = "test-calendly-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.CALENDLY_CLIENT_ID;
  delete process.env.CALENDLY_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.CALENDLY_AUTH_BASE;
  delete process.env.CALENDLY_API_BASE;
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
  "users:read",
  "event_types:read",
  "scheduled_events:read",
  "webhooks:write",
] as const;

const USER_URI = "https://api.calendly.com/users/USER123ABC";
const ORG_URI = "https://api.calendly.com/organizations/ORG456DEF";

const PKCE = {
  codeChallenge: "challenge-abc",
  codeChallengeMethod: "S256",
};
const PKCE_INPUTS = {
  codeVerifier: "verifier-xyz",
  codeChallengeMethod: "S256",
};

const EXPECTED_BASIC = `Basic ${Buffer.from(
  "test-calendly-client-id:test-calendly-client-secret",
  "utf8",
).toString("base64")}`;

describe("calendlyUuidFromUri", () => {
  it("extracts the last path segment", () => {
    expect(calendlyUuidFromUri(USER_URI)).toBe("USER123ABC");
    expect(calendlyUuidFromUri("https://api.calendly.com/users/ABC/")).toBe("ABC");
  });
  it("returns null on empty/invalid input", () => {
    expect(calendlyUuidFromUri(null)).toBeNull();
    expect(calendlyUuidFromUri("")).toBeNull();
  });
});

describe("calendlyOAuth — PKCE S256 (Calendly directs it for ALL app types)", () => {
  it("declares generatePkce with an S256 challenge derived from the verifier", () => {
    expect(calendlyOAuth.generatePkce).toBeDefined();
    const pkce = calendlyOAuth.generatePkce!();
    expect(pkce.codeChallengeMethod).toBe("S256");
    expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(pkce.codeChallenge.length).toBeGreaterThan(0);
    expect(pkce.codeChallenge).not.toBe(pkce.codeVerifier);
  });
});

describe("calendlyOAuth.buildAuthUrl", () => {
  it("uses Calendly's authorize endpoint with space-joined scopes and the PKCE challenge", () => {
    const url = calendlyOAuth.buildAuthUrl("state-xyz", SCOPES, PKCE, null);
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://auth.calendly.com");
    expect(parsed.pathname).toBe("/oauth/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("test-calendly-client-id");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/calendly/callback",
    );
    expect(parsed.searchParams.get("scope")).toBe(
      "users:read event_types:read scheduled_events:read webhooks:write",
    );
    expect(parsed.searchParams.get("state")).toBe("state-xyz");
    expect(parsed.searchParams.get("code_challenge")).toBe("challenge-abc");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    // The client secret NEVER appears in the browser-visible URL.
    expect(url).not.toContain("test-calendly-client-secret");
  });

  it("throws when the dispatcher fails to thread a PKCE challenge", () => {
    expect(() => calendlyOAuth.buildAuthUrl("s", SCOPES, null, null)).toThrow(
      /PKCE/,
    );
  });

  it("honors the CALENDLY_AUTH_BASE e2e override", () => {
    process.env.CALENDLY_AUTH_BASE = "http://localhost:9999";
    const url = calendlyOAuth.buildAuthUrl("s", SCOPES, PKCE, null);
    expect(url.startsWith("http://localhost:9999/oauth/authorize?")).toBe(true);
  });
});

describe("calendlyOAuth.handleCallback", () => {
  const tokenSuccess = {
    token_type: "Bearer",
    access_token: "cal-access-1",
    refresh_token: "cal-refresh-1",
    expires_in: 7200,
    scope: "users:read event_types:read scheduled_events:read webhooks:write",
    owner: USER_URI,
    organization: ORG_URI,
  };
  const meSuccess = {
    resource: {
      uri: USER_URI,
      name: "Marcus Leonard",
      email: "marcus@example.test",
      slug: "marcus",
      current_organization: ORG_URI,
    },
  };

  it("exchanges the code with BASIC auth + code_verifier, resolves identity via /users/me, encrypts tokens", async () => {
    const spy = mockFetchSequence([{ json: tokenSuccess }, { json: meSuccess }]);

    const result = await calendlyOAuth.handleCallback(
      "code-1",
      "state",
      PKCE_INPUTS,
      null,
    );

    // Token exchange wire shape — Basic auth, NO client_secret in body.
    const [tokenUrl, tokenInit] = spy.mock.calls[0]!;
    expect(String(tokenUrl)).toBe("https://auth.calendly.com/oauth/token");
    const headers = (tokenInit as { headers?: Record<string, string> }).headers!;
    expect(headers.Authorization).toBe(EXPECTED_BASIC);
    const body = new URLSearchParams(String((tokenInit as { body?: unknown }).body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code-1");
    expect(body.get("code_verifier")).toBe("verifier-xyz");
    expect(body.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/calendly/callback",
    );
    expect(body.get("client_secret")).toBeNull();

    // /users/me identity call with the fresh access token.
    const [meUrl, meInit] = spy.mock.calls[1]!;
    expect(String(meUrl)).toBe("https://api.calendly.com/users/me");
    expect(
      (meInit as { headers?: unknown }).headers as Record<string, string>,
    ).toMatchObject({ Authorization: "Bearer cal-access-1" });

    // Persisted shape: tokens encrypted, identity mapped, URIs persisted.
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe("cal-access-1");
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe("cal-refresh-1");
    expect(result.tokens.accessTokenExpiresAt).toBeGreaterThan(
      Math.floor(Date.now() / 1000),
    );
    expect(result.tokens.scopes).toEqual([
      "users:read",
      "event_types:read",
      "scheduled_events:read",
      "webhooks:write",
    ]);
    expect(result.account.providerAccountId).toBe("marcus@example.test");
    expect(result.account.displayName).toBe("Marcus Leonard");
    expect(result.account.metadata).toMatchObject({
      calendlyUserUri: USER_URI,
      organizationUri: ORG_URI,
      email: "marcus@example.test",
    });

    // No plaintext token or secret in the persisted payload.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("cal-access-1");
    expect(serialized).not.toContain("cal-refresh-1");
    expect(serialized).not.toContain("test-calendly-client-secret");
  });

  it("falls back to the user UUID as providerAccountId when /users/me has no email", async () => {
    mockFetchSequence([
      { json: tokenSuccess },
      { json: { resource: { ...meSuccess.resource, email: null, name: null } } },
    ]);
    const result = await calendlyOAuth.handleCallback("c", "s", PKCE_INPUTS, null);
    expect(result.account.providerAccountId).toBe("USER123ABC");
    expect(result.account.displayName).toBe("USER123ABC");
  });

  it("fails the connect when refresh_token is missing", async () => {
    mockFetchSequence([{ json: { ...tokenSuccess, refresh_token: undefined } }]);
    await expect(
      calendlyOAuth.handleCallback("c", "s", PKCE_INPUTS, null),
    ).rejects.toThrow(/refresh_token/);
  });

  it("refuses the exchange without a PKCE verifier", async () => {
    await expect(
      calendlyOAuth.handleCallback("c", "s", null, null),
    ).rejects.toThrow(/code_verifier/);
  });

  it("surfaces a sanitized error on a failed exchange (bare OAuth error code)", async () => {
    mockFetchSequence([
      {
        status: 400,
        json: { error: "invalid_grant", error_description: "Code expired" },
      },
    ]);
    await expect(
      calendlyOAuth.handleCallback("c", "s", PKCE_INPUTS, null),
    ).rejects.toThrow(/invalid_grant/);
  });

  it("fails when /users/me lookup fails", async () => {
    mockFetchSequence([{ json: tokenSuccess }, { status: 500, text: "boom" }]);
    await expect(
      calendlyOAuth.handleCallback("c", "s", PKCE_INPUTS, null),
    ).rejects.toThrow(/\/users\/me lookup failed/);
  });
});

describe("calendlyOAuth.refreshToken — single-use rotation", () => {
  it("persists the ROTATED refresh token (old one is revoked provider-side) using Basic auth", async () => {
    const spy = mockFetchSequence([
      {
        json: {
          access_token: "cal-access-2",
          refresh_token: "cal-refresh-2",
          expires_in: 7200,
        },
      },
    ]);
    const tokens = await calendlyOAuth.refreshToken("cal-refresh-1");
    const [, init] = spy.mock.calls[0]!;
    const headers = (init as { headers?: Record<string, string> }).headers!;
    expect(headers.Authorization).toBe(EXPECTED_BASIC);
    const body = new URLSearchParams(String((init as { body?: unknown }).body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("cal-refresh-1");
    expect(decryptToken(tokens.accessTokenEncrypted)).toBe("cal-access-2");
    expect(decryptToken(tokens.refreshTokenEncrypted!)).toBe("cal-refresh-2");
  });

  it("keeps the original refresh token only when the response omits one (defensive)", async () => {
    mockFetchSequence([
      { json: { access_token: "cal-access-2", expires_in: 7200 } },
    ]);
    const tokens = await calendlyOAuth.refreshToken("cal-refresh-1");
    expect(decryptToken(tokens.refreshTokenEncrypted!)).toBe("cal-refresh-1");
  });

  it("maps invalid_grant (spent/revoked token) to RefreshAuthRequiredError", async () => {
    mockFetchSequence([{ status: 400, json: { error: "invalid_grant" } }]);
    await expect(calendlyOAuth.refreshToken("dead")).rejects.toBeInstanceOf(
      RefreshAuthRequiredError,
    );
  });

  it("throws a plain error on non-auth refresh failures", async () => {
    mockFetchSequence([{ status: 500, text: "oops" }]);
    await expect(calendlyOAuth.refreshToken("r")).rejects.toThrow(
      /token refresh failed/,
    );
  });
});
