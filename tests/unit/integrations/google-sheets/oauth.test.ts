/**
 * @jest-environment node
 *
 * Tests for googleSheetsOAuth.
 *
 * Strategy mirrors google-drive/oauth.test.ts: mock global fetch so token
 * exchange + userinfo lookup + refresh hit a captured handler. We focus on
 * Sheets-specific behavior (redirect URL, scope set, OIDC userinfo
 * endpoint, account shape) rather than re-asserting every shared-helper
 * detail Gmail's tests already cover.
 */
import { createHash } from "node:crypto";
import { googleSheetsOAuth } from "@/integrations/google-sheets/oauth";
import { decryptToken } from "@/core/encryption/tokens";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 11) % 256;
  return bytes.toString("base64");
})();

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.GOOGLE_AUTHORIZE_BASE;
  delete process.env.GOOGLE_TOKEN_BASE;
  delete process.env.GOOGLE_USERINFO_BASE;
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

describe("googleSheetsOAuth.generatePkce", () => {
  it("delegates to the shared Google PKCE generator", () => {
    expect(googleSheetsOAuth.generatePkce).toBeDefined();
    const pkce = googleSheetsOAuth.generatePkce!();
    expect(pkce.codeChallengeMethod).toBe("S256");
    expect(pkce.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const expected = createHash("sha256")
      .update(pkce.codeVerifier)
      .digest("base64url");
    expect(pkce.codeChallenge).toBe(expected);
  });
});

describe("googleSheetsOAuth.buildAuthUrl", () => {
  const SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/userinfo.email",
  ];
  const PKCE_CHALLENGE = {
    codeChallenge: "fake-challenge-base64url",
    codeChallengeMethod: "S256",
  };

  it("uses the Sheets-specific redirect_uri", () => {
    const url = googleSheetsOAuth.buildAuthUrl(
      "STATE-TOKEN",
      SCOPES,
      PKCE_CHALLENGE,
    );
    const u = new URL(url);
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/google-sheets/callback",
    );
  });

  it("requests Sheets' full scope + userinfo.email", () => {
    const url = googleSheetsOAuth.buildAuthUrl(
      "STATE-TOKEN",
      SCOPES,
      PKCE_CHALLENGE,
    );
    const u = new URL(url);
    expect(u.searchParams.get("scope")).toBe(SCOPES.join(" "));
  });

  it("includes shared Google v2 OAuth + PKCE params", () => {
    const url = googleSheetsOAuth.buildAuthUrl(
      "STATE-TOKEN",
      SCOPES,
      PKCE_CHALLENGE,
    );
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("code_challenge")).toBe(
      "fake-challenge-base64url",
    );
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("throws when pkce is null (Sheets requires PKCE)", () => {
    expect(() =>
      googleSheetsOAuth.buildAuthUrl("S", SCOPES, null),
    ).toThrow(/PKCE/);
  });

  it("uses GOOGLE_AUTHORIZE_BASE override when set", () => {
    process.env.GOOGLE_AUTHORIZE_BASE = "http://127.0.0.1:9877";
    const url = googleSheetsOAuth.buildAuthUrl(
      "S",
      SCOPES,
      PKCE_CHALLENGE,
    );
    expect(new URL(url).origin).toBe("http://127.0.0.1:9877");
  });
});

describe("googleSheetsOAuth.handleCallback", () => {
  const PKCE_INPUTS = {
    codeVerifier: "verifier-secret-43chars",
    codeChallengeMethod: "S256",
  };

  it("posts the auth code to the Google token endpoint with code_verifier", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ya29.sheets-access",
          refresh_token: "1//sheets-refresh",
          expires_in: 3599,
          scope:
            "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email",
        },
      },
      {
        ok: true,
        json: {
          email: "alice@example.com",
          sub: "google-uid-1",
          email_verified: true,
        },
      },
    ]);

    await googleSheetsOAuth.handleCallback("auth-code", "state", PKCE_INPUTS);

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }),
    );
    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("auth-code");
    expect(params.get("code_verifier")).toBe("verifier-secret-43chars");
    expect(params.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/google-sheets/callback",
    );
  });

  it("calls the OIDC userinfo endpoint with Bearer access token", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ya29.access",
          refresh_token: "1//refresh",
          expires_in: 3599,
          scope: "https://www.googleapis.com/auth/spreadsheets",
        },
      },
      { ok: true, json: { email: "alice@example.com", sub: "uid-1" } },
    ]);

    await googleSheetsOAuth.handleCallback("c", "s", PKCE_INPUTS);

    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://openidconnect.googleapis.com/v1/userinfo",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer ya29.access" },
      }),
    );
  });

  it("encrypts both access and refresh tokens; decrypt round-trips", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ya29.real-access",
          refresh_token: "1//real-refresh",
          expires_in: 3599,
          scope: "https://www.googleapis.com/auth/spreadsheets",
        },
      },
      { ok: true, json: { email: "alice@example.com", sub: "uid" } },
    ]);

    const result = await googleSheetsOAuth.handleCallback(
      "c",
      "s",
      PKCE_INPUTS,
    );

    expect(result.tokens.accessTokenEncrypted).not.toContain(
      "ya29.real-access",
    );
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(
      "ya29.real-access",
    );
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe(
      "1//real-refresh",
    );
  });

  it("populates accountInfo from userinfo email", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ya29.x",
          refresh_token: "1//y",
          expires_in: 3599,
          scope: "https://www.googleapis.com/auth/spreadsheets",
        },
      },
      {
        ok: true,
        json: {
          email: "bob@example.com",
          email_verified: true,
          sub: "google-uid-2",
        },
      },
    ]);

    const result = await googleSheetsOAuth.handleCallback(
      "c",
      "s",
      PKCE_INPUTS,
    );

    expect(result.account.providerAccountId).toBe("bob@example.com");
    expect(result.account.displayName).toBe("bob@example.com");
    expect(result.account.metadata).toEqual({
      email: "bob@example.com",
      sub: "google-uid-2",
      emailVerified: true,
    });
  });

  it("throws when pkce is null", async () => {
    await expect(
      googleSheetsOAuth.handleCallback("c", "s", null),
    ).rejects.toThrow(/PKCE code_verifier is required/);
  });

  it("throws when pkce.codeVerifier is empty", async () => {
    await expect(
      googleSheetsOAuth.handleCallback("c", "s", {
        codeVerifier: "",
        codeChallengeMethod: "S256",
      }),
    ).rejects.toThrow(/PKCE code_verifier is required/);
  });

  it("surfaces Google's error code on token-exchange HTTP error", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: { error: "invalid_grant", error_description: "code expired" },
      },
    ]);
    await expect(
      googleSheetsOAuth.handleCallback("bad-code", "s", PKCE_INPUTS),
    ).rejects.toThrow(/invalid_grant/);
  });

  it("throws when token response is missing refresh_token", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ya29.x",
          expires_in: 3599,
          scope: "https://www.googleapis.com/auth/spreadsheets",
        },
      },
    ]);
    await expect(
      googleSheetsOAuth.handleCallback("c", "s", PKCE_INPUTS),
    ).rejects.toThrow(/missing refresh_token/);
  });

  it("throws when userinfo response is missing email", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ya29.x",
          refresh_token: "1//y",
          expires_in: 3599,
          scope: "https://www.googleapis.com/auth/spreadsheets",
        },
      },
      { ok: true, json: { sub: "uid-only" } }, // no email
    ]);
    await expect(
      googleSheetsOAuth.handleCallback("c", "s", PKCE_INPUTS),
    ).rejects.toThrow(/userinfo response missing email/);
  });

  it("uses GOOGLE_TOKEN_BASE + GOOGLE_USERINFO_BASE overrides when set", async () => {
    process.env.GOOGLE_TOKEN_BASE = "http://127.0.0.1:9877";
    process.env.GOOGLE_USERINFO_BASE = "http://127.0.0.1:9877";
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ya29.x",
          refresh_token: "1//y",
          expires_in: 3599,
          scope: "https://www.googleapis.com/auth/spreadsheets",
        },
      },
      { ok: true, json: { email: "alice@example.com" } },
    ]);

    await googleSheetsOAuth.handleCallback("c", "s", PKCE_INPUTS);

    expect(fetchSpy.mock.calls[0]![0]).toBe("http://127.0.0.1:9877/token");
    expect(fetchSpy.mock.calls[1]![0]).toBe(
      "http://127.0.0.1:9877/v1/userinfo",
    );
  });
});

describe("googleSheetsOAuth.refreshToken", () => {
  it("delegates to the shared Google refresh helper (preserve-old policy)", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ya29.new",
          // no rotation — preserve-old applies
          expires_in: 3599,
          scope: "",
        },
      },
    ]);

    const result = await googleSheetsOAuth.refreshToken("1//original");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(decryptToken(result.refreshTokenEncrypted!)).toBe("1//original");
    expect(decryptToken(result.accessTokenEncrypted)).toBe("ya29.new");
  });

  it("uses the rotated refresh_token when Google returns one", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ya29.new",
          refresh_token: "1//rotated",
          expires_in: 3599,
          scope: "",
        },
      },
    ]);

    const result = await googleSheetsOAuth.refreshToken("1//old");

    expect(decryptToken(result.refreshTokenEncrypted!)).toBe("1//rotated");
  });

  it("surfaces Google's error code on refresh failure", async () => {
    mockFetchSequence([
      { ok: false, status: 400, json: { error: "invalid_grant" } },
    ]);
    await expect(
      googleSheetsOAuth.refreshToken("dead-token"),
    ).rejects.toThrow(/invalid_grant/);
  });
});

describe("googleSheetsOAuth.revoke", () => {
  it("is a no-op stub (matches Gmail/Calendar/Drive/Slack pattern)", async () => {
    await expect(googleSheetsOAuth.revoke("any-token")).resolves.toBeUndefined();
  });
});
