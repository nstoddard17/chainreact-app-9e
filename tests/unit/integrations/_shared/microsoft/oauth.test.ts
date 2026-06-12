/**
 * @jest-environment node
 *
 * Tests for the shared Microsoft OAuth helpers. Provider-specific OAuth
 * modules (microsoft-outlook, microsoft-outlook-calendar) delegate to
 * these helpers; per-provider tests cover the redirect-URL and Graph /me
 * fallback policies. This file covers the wire-format helpers in
 * isolation.
 */
import { createHash } from "node:crypto";
import {
  buildMicrosoftAuthUrl,
  exchangeMicrosoftAuthCode,
  generateMicrosoftPkce,
  microsoftAuthorizeBase,
  microsoftTokenBase,
  refreshMicrosoftToken,
} from "@/integrations/_shared/microsoft/oauth";
import { decryptToken } from "@/core/encryption/tokens";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 13) % 256;
  return bytes.toString("base64");
})();

beforeEach(() => {
  process.env.MICROSOFT_CLIENT_ID = "test-microsoft-client-id";
  process.env.MICROSOFT_CLIENT_SECRET = "test-microsoft-client-secret";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MICROSOFT_CLIENT_ID;
  delete process.env.MICROSOFT_CLIENT_SECRET;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.MICROSOFT_AUTHORIZE_BASE;
  delete process.env.MICROSOFT_TOKEN_BASE;
});

function mockFetchSequence(
  responses: Array<{ ok: boolean; status?: number; json: unknown }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    spy.mockResolvedValueOnce(
      new Response(JSON.stringify(r.json), {
        status: r.status ?? (r.ok ? 200 : 500),
      }),
    );
  }
  return spy;
}

// ─── env helpers ────────────────────────────────────────────────────────────

describe("microsoftAuthorizeBase / microsoftTokenBase", () => {
  it("default to https://login.microsoftonline.com when env vars unset", () => {
    expect(microsoftAuthorizeBase()).toBe("https://login.microsoftonline.com");
    expect(microsoftTokenBase()).toBe("https://login.microsoftonline.com");
  });

  it("honor MICROSOFT_AUTHORIZE_BASE / MICROSOFT_TOKEN_BASE overrides", () => {
    process.env.MICROSOFT_AUTHORIZE_BASE = "http://127.0.0.1:9876";
    process.env.MICROSOFT_TOKEN_BASE = "http://127.0.0.1:9877";
    expect(microsoftAuthorizeBase()).toBe("http://127.0.0.1:9876");
    expect(microsoftTokenBase()).toBe("http://127.0.0.1:9877");
  });
});

// ─── PKCE ───────────────────────────────────────────────────────────────────

describe("generateMicrosoftPkce", () => {
  it("returns S256 PKCE pair with verifier hashed to challenge", () => {
    const pkce = generateMicrosoftPkce();
    expect(pkce.codeChallengeMethod).toBe("S256");
    expect(pkce.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const expected = createHash("sha256")
      .update(pkce.codeVerifier)
      .digest("base64url");
    expect(pkce.codeChallenge).toBe(expected);
  });

  it("generates a fresh pair on each call (not cached)", () => {
    const a = generateMicrosoftPkce();
    const b = generateMicrosoftPkce();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).not.toBe(b.codeChallenge);
  });
});

// ─── buildMicrosoftAuthUrl ─────────────────────────────────────────────────

const PKCE_CHALLENGE = {
  codeChallenge: "fake-microsoft-challenge",
  codeChallengeMethod: "S256",
};

describe("buildMicrosoftAuthUrl", () => {
  it("uses the multi-tenant /common/ authorize endpoint", () => {
    const url = buildMicrosoftAuthUrl({
      state: "STATE",
      scopes: ["offline_access", "Mail.Send"],
      pkceChallenge: PKCE_CHALLENGE,
      redirectUrl: "https://app.example.test/cb",
    });
    expect(new URL(url).origin + new URL(url).pathname).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
  });

  it("forwards the redirectUrl, state, and PKCE params verbatim", () => {
    const url = buildMicrosoftAuthUrl({
      state: "abc",
      scopes: ["offline_access", "Calendars.ReadWrite"],
      pkceChallenge: PKCE_CHALLENGE,
      redirectUrl: "https://app.example.test/microsoft-outlook-calendar/callback",
    });
    const u = new URL(url);
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/microsoft-outlook-calendar/callback",
    );
    expect(u.searchParams.get("state")).toBe("abc");
    expect(u.searchParams.get("code_challenge")).toBe(
      "fake-microsoft-challenge",
    );
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("4.APPS-RECONNECT — steers the sign-in to the intended account (login_hint + prompt=select_account)", () => {
    const url = buildMicrosoftAuthUrl({
      state: "x",
      scopes: ["offline_access", "Mail.Send"],
      pkceChallenge: PKCE_CHALLENGE,
      redirectUrl: "https://app.example.test/cb",
      accountSteer: { loginHint: "marcus@example.com", forceAccountSelection: true },
    });
    const u = new URL(url);
    expect(u.searchParams.get("login_hint")).toBe("marcus@example.com");
    expect(u.searchParams.get("prompt")).toBe("select_account");
  });

  it("4.APPS-RECONNECT — a normal connect (no steer) adds no login_hint / prompt", () => {
    const url = buildMicrosoftAuthUrl({
      state: "x",
      scopes: ["offline_access", "Mail.Send"],
      pkceChallenge: PKCE_CHALLENGE,
      redirectUrl: "https://app.example.test/cb",
    });
    const u = new URL(url);
    expect(u.searchParams.get("login_hint")).toBeNull();
    expect(u.searchParams.get("prompt")).toBeNull();
  });

  it("space-separates scopes (Microsoft v2 endpoint convention)", () => {
    const url = buildMicrosoftAuthUrl({
      state: "x",
      scopes: ["offline_access", "Calendars.ReadWrite"],
      pkceChallenge: PKCE_CHALLENGE,
      redirectUrl: "https://app.example.test/cb",
    });
    expect(new URL(url).searchParams.get("scope")).toBe(
      "offline_access Calendars.ReadWrite",
    );
  });

  it("includes response_type=code, response_mode=query, client_id", () => {
    const url = buildMicrosoftAuthUrl({
      state: "x",
      scopes: ["x"],
      pkceChallenge: PKCE_CHALLENGE,
      redirectUrl: "https://x/cb",
    });
    const u = new URL(url);
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("response_mode")).toBe("query");
    expect(u.searchParams.get("client_id")).toBe("test-microsoft-client-id");
  });

  it("throws when MICROSOFT_CLIENT_ID is unset", () => {
    delete process.env.MICROSOFT_CLIENT_ID;
    expect(() =>
      buildMicrosoftAuthUrl({
        state: "x",
        scopes: ["x"],
        pkceChallenge: PKCE_CHALLENGE,
        redirectUrl: "https://x/cb",
      }),
    ).toThrow(/MICROSOFT_CLIENT_ID/);
  });

  it("uses MICROSOFT_AUTHORIZE_BASE override when set", () => {
    process.env.MICROSOFT_AUTHORIZE_BASE = "http://127.0.0.1:9876";
    const url = buildMicrosoftAuthUrl({
      state: "x",
      scopes: ["x"],
      pkceChallenge: PKCE_CHALLENGE,
      redirectUrl: "https://x/cb",
    });
    expect(new URL(url).origin).toBe("http://127.0.0.1:9876");
  });
});

// ─── exchangeMicrosoftAuthCode ─────────────────────────────────────────────

describe("exchangeMicrosoftAuthCode", () => {
  it("posts the auth code to /common/oauth2/v2.0/token with PKCE verifier", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ms-access",
          refresh_token: "ms-refresh",
          expires_in: 3599,
          scope: "offline_access Mail.Send",
          token_type: "Bearer",
        },
      },
    ]);

    await exchangeMicrosoftAuthCode({
      code: "auth-code",
      codeVerifier: "verifier-43chars",
      redirectUrl: "https://app.example.test/cb",
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    );
    const init = fetchSpy.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    const params = new URLSearchParams(init.body as string);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("auth-code");
    expect(params.get("code_verifier")).toBe("verifier-43chars");
    expect(params.get("client_id")).toBe("test-microsoft-client-id");
    expect(params.get("client_secret")).toBe("test-microsoft-client-secret");
    expect(params.get("redirect_uri")).toBe("https://app.example.test/cb");
  });

  it("returns access + refresh + expiresAt + scopesGranted", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "a",
          refresh_token: "r",
          expires_in: 3599,
          scope: "offline_access Calendars.ReadWrite",
        },
      },
    ]);

    const before = Math.floor(Date.now() / 1000);
    const result = await exchangeMicrosoftAuthCode({
      code: "c",
      codeVerifier: "v",
      redirectUrl: "https://x/cb",
    });
    const after = Math.floor(Date.now() / 1000);

    expect(result.accessToken).toBe("a");
    expect(result.refreshToken).toBe("r");
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 3599);
    expect(result.expiresAt).toBeLessThanOrEqual(after + 3599);
    expect(result.scopesGranted).toEqual([
      "offline_access",
      "Calendars.ReadWrite",
    ]);
  });

  it("throws when the response omits refresh_token (offline_access misconfig)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: { access_token: "x", expires_in: 3599, scope: "Mail.Send" },
      },
    ]);

    await expect(
      exchangeMicrosoftAuthCode({
        code: "c",
        codeVerifier: "v",
        redirectUrl: "https://x/cb",
      }),
    ).rejects.toThrow(/missing refresh_token/);
  });

  it("surfaces Microsoft's error code on token-exchange HTTP error", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: { error: "invalid_grant", error_description: "code expired" },
      },
    ]);

    await expect(
      exchangeMicrosoftAuthCode({
        code: "bad",
        codeVerifier: "v",
        redirectUrl: "https://x/cb",
      }),
    ).rejects.toThrow(/invalid_grant/);
  });
});

// ─── refreshMicrosoftToken ─────────────────────────────────────────────────

describe("refreshMicrosoftToken", () => {
  it("preserves the old refresh token when Microsoft omits one (preserve-old policy)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: { access_token: "new", expires_in: 3599, scope: "Mail.Send" },
      },
    ]);

    const result = await refreshMicrosoftToken("original-refresh");

    expect(decryptToken(result.refreshTokenEncrypted!)).toBe(
      "original-refresh",
    );
    expect(decryptToken(result.accessTokenEncrypted)).toBe("new");
  });

  it("uses the rotated refresh_token when Microsoft returns one", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "new",
          refresh_token: "rotated",
          expires_in: 3599,
          scope: "Mail.Send",
        },
      },
    ]);

    const result = await refreshMicrosoftToken("old");

    expect(decryptToken(result.refreshTokenEncrypted!)).toBe("rotated");
  });

  it("posts grant_type=refresh_token with client credentials", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: { access_token: "x", expires_in: 3599, scope: "Mail.Send" },
      },
    ]);

    await refreshMicrosoftToken("token-secret");

    const params = new URLSearchParams(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("token-secret");
    expect(params.get("client_id")).toBe("test-microsoft-client-id");
    expect(params.get("client_secret")).toBe("test-microsoft-client-secret");
  });

  it("computes accessTokenExpiresAt from expires_in seconds", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: { access_token: "x", expires_in: 3599, scope: "Mail.Send" },
      },
    ]);

    const before = Math.floor(Date.now() / 1000);
    const result = await refreshMicrosoftToken("rt");
    const after = Math.floor(Date.now() / 1000);

    expect(result.accessTokenExpiresAt).toBeGreaterThanOrEqual(before + 3599);
    expect(result.accessTokenExpiresAt).toBeLessThanOrEqual(after + 3599);
  });

  it("surfaces Microsoft's error code on refresh failure", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: { error: "invalid_grant", error_description: "AADSTS50173" },
      },
    ]);

    await expect(refreshMicrosoftToken("dead")).rejects.toThrow(
      /invalid_grant/,
    );
  });
});
