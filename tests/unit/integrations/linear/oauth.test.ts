/**
 * @jest-environment node
 *
 * Tests for linearOAuth — CS-1 MCP-AUTH (first consumer of the shared MCP
 * OAuth helper, STATIC endpoint mode = Linear's regular OAuth, whose Bearer
 * tokens mcp.linear.app accepts per vendor docs).
 *
 * Strategy mirrors asana/oauth.test.ts: real encryption via a test
 * TOKEN_ENCRYPTION_KEY, fetch mocked at the global boundary. Covers PKCE,
 * authorize-URL shape (COMMA-joined scopes, no resource param), callback
 * (token exchange body + GraphQL viewer identity + encryption round-trip),
 * the mandatory-refresh-token rule (24h tokens since 2026-04-01), refresh
 * rotation, invalid_grant mapping, and revocation.
 */
import { decryptToken } from "@/core/encryption/tokens";
import { RefreshAuthRequiredError } from "@/contracts/integration";
import { linearOAuth } from "@/integrations/linear/oauth";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 17) % 256;
  return bytes.toString("base64");
})();

beforeEach(() => {
  process.env.LINEAR_CLIENT_ID = "test-linear-client-id";
  process.env.LINEAR_CLIENT_SECRET = "test-linear-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.LINEAR_CLIENT_ID;
  delete process.env.LINEAR_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.LINEAR_AUTHORIZE_BASE;
  delete process.env.LINEAR_TOKEN_BASE;
  delete process.env.LINEAR_API_BASE;
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
      spy.mockResolvedValueOnce(new Response(JSON.stringify(r.json), { status }));
    }
  }
  return spy;
}

const SCOPES = ["read", "write"] as const;
const PKCE_IN = { codeVerifier: "verifier-abc", codeChallengeMethod: "S256" };

const tokenSuccess = {
  access_token: "at-plain",
  refresh_token: "rt-plain",
  expires_in: 86400,
  scope: "read,write",
  token_type: "Bearer",
};

const viewerSuccess = {
  data: { viewer: { id: "lin-user-uuid-1", name: "Marcus T", email: "marcus@example.test" } },
};

describe("linearOAuth.generatePkce", () => {
  it("generates fresh S256 pairs", () => {
    const a = linearOAuth.generatePkce!();
    const b = linearOAuth.generatePkce!();
    expect(a.codeChallengeMethod).toBe("S256");
    expect(a.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});

describe("linearOAuth.buildAuthUrl (static mode — synchronous)", () => {
  it("uses Linear's authorize endpoint with PKCE + COMMA-joined scopes and NO resource param", async () => {
    const result = linearOAuth.buildAuthUrl("state-xyz", SCOPES, {
      codeChallenge: "chal-1",
      codeChallengeMethod: "S256",
    });
    // Static mode needs no discovery I/O — stays a plain string.
    expect(typeof result).toBe("string");
    const url = new URL(await result);
    expect(url.origin).toBe("https://linear.app");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-linear-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/linear/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("read,write");
    expect(url.searchParams.get("state")).toBe("state-xyz");
    expect(url.searchParams.get("code_challenge")).toBe("chal-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("resource")).toBeNull();
  });

  it("throws when the dispatcher failed to thread a PKCE challenge", () => {
    expect(() => linearOAuth.buildAuthUrl("s", SCOPES, null)).toThrow(
      /PKCE challenge is required/,
    );
  });

  it("honors LINEAR_AUTHORIZE_BASE for e2e (loopback http allowed)", async () => {
    process.env.LINEAR_AUTHORIZE_BASE = "http://localhost:4611";
    const url = String(
      await linearOAuth.buildAuthUrl("s", SCOPES, {
        codeChallenge: "c",
        codeChallengeMethod: "S256",
      }),
    );
    expect(url.startsWith("http://localhost:4611/oauth/authorize?")).toBe(true);
  });
});

describe("linearOAuth.handleCallback", () => {
  it("exchanges the code (body-auth + code_verifier) then resolves identity via GraphQL viewer", async () => {
    const spy = mockFetchSequence([{ json: tokenSuccess }, { json: viewerSuccess }]);
    const result = await linearOAuth.handleCallback("code-1", "state", PKCE_IN);

    const [tokenUrl, tokenInit] = spy.mock.calls[0]!;
    expect(String(tokenUrl)).toBe("https://api.linear.app/oauth/token");
    const body = new URLSearchParams(String((tokenInit as { body?: unknown }).body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe("test-linear-client-id");
    expect(body.get("client_secret")).toBe("test-linear-client-secret");
    expect(body.get("code")).toBe("code-1");
    expect(body.get("code_verifier")).toBe("verifier-abc");
    expect(body.get("resource")).toBeNull();

    const [viewerUrl, viewerInit] = spy.mock.calls[1]!;
    expect(String(viewerUrl)).toBe("https://api.linear.app/graphql");
    const viewerHeaders = (viewerInit as { headers?: Record<string, string> }).headers!;
    expect(viewerHeaders.Authorization).toBe("Bearer at-plain");

    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe("at-plain");
    expect(result.tokens.accessTokenEncrypted).not.toContain("at-plain");
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe("rt-plain");
    expect(result.tokens.scopes).toEqual(["read", "write"]);
    expect(result.tokens.accessTokenExpiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // Identity: stable UUID as providerAccountId, human displayName.
    expect(result.account.providerAccountId).toBe("lin-user-uuid-1");
    expect(result.account.displayName).toBe("Marcus T");
    expect(result.account.metadata).toEqual({
      linearUserId: "lin-user-uuid-1",
      email: "marcus@example.test",
      name: "Marcus T",
    });
  });

  it("rejects a token response missing refresh_token (24h tokens would strand the row)", async () => {
    mockFetchSequence([{ json: { ...tokenSuccess, refresh_token: undefined } }]);
    await expect(linearOAuth.handleCallback("c", "s", PKCE_IN)).rejects.toThrow(
      /missing refresh_token/,
    );
  });

  it("rejects a token response missing access_token", async () => {
    mockFetchSequence([{ json: { refresh_token: "rt" } }]);
    await expect(linearOAuth.handleCallback("c", "s", PKCE_IN)).rejects.toThrow(
      /missing access_token/,
    );
  });

  it("refuses the exchange without a PKCE verifier", async () => {
    await expect(linearOAuth.handleCallback("c", "s", null)).rejects.toThrow(/code_verifier/);
  });

  it("fails when the viewer lookup fails or lacks an id", async () => {
    mockFetchSequence([{ json: tokenSuccess }, { status: 401, text: "no" }]);
    await expect(linearOAuth.handleCallback("c", "s", PKCE_IN)).rejects.toThrow(
      /viewer lookup failed: HTTP 401/,
    );

    mockFetchSequence([{ json: tokenSuccess }, { json: { data: { viewer: {} } } }]);
    await expect(linearOAuth.handleCallback("c", "s", PKCE_IN)).rejects.toThrow(
      /viewer response missing id/,
    );
  });

  it("surfaces only the bare OAuth error code on a failed exchange", async () => {
    mockFetchSequence([
      { status: 400, json: { error: "invalid_request", error_description: "PRIVATE" } },
    ]);
    const err = await linearOAuth.handleCallback("c", "s", PKCE_IN).catch((e: unknown) => e);
    expect(String(err)).toMatch(/token exchange failed: invalid_request/);
    expect(String(err)).not.toMatch(/PRIVATE/);
  });
});

describe("linearOAuth.refreshToken", () => {
  it("persists the ROTATED refresh token (Linear rotates on every use)", async () => {
    const spy = mockFetchSequence([
      { json: { access_token: "at-new", refresh_token: "rt-rotated", expires_in: 86400 } },
    ]);
    const tokens = await linearOAuth.refreshToken("rt-original");
    const body = new URLSearchParams(
      String((spy.mock.calls[0]![1] as { body?: unknown }).body),
    );
    expect(String(spy.mock.calls[0]![0])).toBe("https://api.linear.app/oauth/token");
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-original");
    expect(body.get("client_secret")).toBe("test-linear-client-secret");
    expect(decryptToken(tokens.accessTokenEncrypted)).toBe("at-new");
    expect(decryptToken(tokens.refreshTokenEncrypted!)).toBe("rt-rotated");
  });

  it("preserves the original refresh token if a response omits one (defensive)", async () => {
    mockFetchSequence([{ json: { access_token: "at-new", expires_in: 86400 } }]);
    const tokens = await linearOAuth.refreshToken("rt-original");
    expect(decryptToken(tokens.refreshTokenEncrypted!)).toBe("rt-original");
  });

  it("maps invalid_grant to RefreshAuthRequiredError (dead grant → reconnect)", async () => {
    mockFetchSequence([{ status: 400, json: { error: "invalid_grant" } }]);
    await expect(linearOAuth.refreshToken("rt-dead")).rejects.toBeInstanceOf(
      RefreshAuthRequiredError,
    );
  });

  it("keeps transient refresh failures generic (no reconnect signal)", async () => {
    mockFetchSequence([{ status: 500, text: "upstream oops" }]);
    const err = await linearOAuth.refreshToken("rt").catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(RefreshAuthRequiredError);
    expect(String(err)).toMatch(/token refresh failed/);
  });
});

describe("linearOAuth.revoke", () => {
  it("posts the token to Linear's documented revoke endpoint (best-effort)", async () => {
    const spy = mockFetchSequence([{ json: {} }]);
    await linearOAuth.revoke("tok-1");
    expect(String(spy.mock.calls[0]![0])).toBe("https://api.linear.app/oauth/revoke");
    const body = new URLSearchParams(
      String((spy.mock.calls[0]![1] as { body?: unknown }).body),
    );
    expect(body.get("token")).toBe("tok-1");
  });
});
