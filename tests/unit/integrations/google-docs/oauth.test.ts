/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-2 — googleDocsOAuth.
 *
 * Mirrors the google-sheets/oauth.test.ts shape. Focused on
 * Docs-specific behavior (redirect URL, OIDC userinfo lookup, account
 * shape). Shared Google PKCE / token-exchange / refresh paths are
 * covered by the existing google-sheets / google-drive suites.
 */
import { createHash } from "node:crypto";
import { googleDocsOAuth } from "@/integrations/google-docs/oauth";
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

describe("googleDocsOAuth.generatePkce", () => {
  it("delegates to the shared Google PKCE generator", () => {
    expect(googleDocsOAuth.generatePkce).toBeDefined();
    const pkce = googleDocsOAuth.generatePkce!();
    expect(pkce.codeChallengeMethod).toBe("S256");
    expect(pkce.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const expected = createHash("sha256")
      .update(pkce.codeVerifier)
      .digest("base64url");
    expect(pkce.codeChallenge).toBe(expected);
  });
});

describe("googleDocsOAuth.buildAuthUrl", () => {
  const SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/userinfo.email",
  ];
  const PKCE_CHALLENGE = {
    codeChallenge: "fake-challenge-base64url",
    codeChallengeMethod: "S256",
  };

  it("uses the Docs-specific redirect_uri", () => {
    const url = googleDocsOAuth.buildAuthUrl(
      "STATE-TOKEN",
      SCOPES,
      PKCE_CHALLENGE,
    );
    const u = new URL(url);
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/google-docs/callback",
    );
  });

  it("requests Docs' documents + drive + userinfo.email scopes", () => {
    const url = googleDocsOAuth.buildAuthUrl(
      "STATE-TOKEN",
      SCOPES,
      PKCE_CHALLENGE,
    );
    expect(new URL(url).searchParams.get("scope")).toBe(SCOPES.join(" "));
  });

  it("throws when pkce is null (Docs requires PKCE)", () => {
    expect(() => googleDocsOAuth.buildAuthUrl("S", SCOPES, null)).toThrow(
      /PKCE/,
    );
  });
});

describe("googleDocsOAuth.handleCallback", () => {
  const PKCE_INPUTS = {
    codeVerifier: "verifier-secret-43chars",
    codeChallengeMethod: "S256",
  };

  it("exchanges code → tokens, looks up userinfo, returns user-shaped account", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ya29.docs-access",
          refresh_token: "1//docs-refresh",
          expires_in: 3599,
          scope:
            "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email",
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

    const result = await googleDocsOAuth.handleCallback(
      "AUTH_CODE",
      "STATE",
      PKCE_INPUTS,
    );

    expect(result.account.providerAccountId).toBe("alice@example.com");
    expect(result.account.displayName).toBe("alice@example.com");
    expect(result.account.metadata).toEqual({
      email: "alice@example.com",
      sub: "google-uid-1",
      emailVerified: true,
    });

    // Verify tokens are encrypted (test by round-tripping via decryptToken).
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(
      "ya29.docs-access",
    );
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe(
      "1//docs-refresh",
    );
  });

  it("throws when userinfo lookup fails", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ya29.docs-access",
          refresh_token: "1//docs-refresh",
          expires_in: 3599,
          scope: "https://www.googleapis.com/auth/drive",
        },
      },
      { ok: false, status: 500, json: {} },
    ]);

    await expect(
      googleDocsOAuth.handleCallback("CODE", "STATE", PKCE_INPUTS),
    ).rejects.toThrow(/userinfo/);
  });

  it("throws when userinfo response omits email", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ya29.docs-access",
          refresh_token: "1//docs-refresh",
          expires_in: 3599,
          scope: "https://www.googleapis.com/auth/drive",
        },
      },
      { ok: true, json: { sub: "google-uid-1" } },
    ]);

    await expect(
      googleDocsOAuth.handleCallback("CODE", "STATE", PKCE_INPUTS),
    ).rejects.toThrow(/missing email/);
  });

  it("throws when pkce is null", async () => {
    await expect(
      googleDocsOAuth.handleCallback("CODE", "STATE", null),
    ).rejects.toThrow(/PKCE/);
  });
});
