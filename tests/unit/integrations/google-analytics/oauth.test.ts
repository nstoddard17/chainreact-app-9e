/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-2 — googleAnalyticsOAuth. GA-specific redirect
 * URL, scopes, and OIDC-userinfo account resolution. Shared Google PKCE /
 * token-exchange / refresh paths are covered by the docs/sheets suites.
 */
import { createHash } from "node:crypto";
import { googleAnalyticsOAuth } from "@/integrations/google-analytics/oauth";
import { decryptToken } from "@/core/encryption/tokens";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 11) % 256;
  return bytes.toString("base64");
})();

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/analytics.edit",
  "https://www.googleapis.com/auth/userinfo.email",
];

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

describe("googleAnalyticsOAuth.buildAuthUrl", () => {
  const PKCE = { codeChallenge: "challenge", codeChallengeMethod: "S256" };

  it("uses the GA-specific redirect_uri + offline access + space-joined scopes", () => {
    const u = new URL(googleAnalyticsOAuth.buildAuthUrl("STATE", SCOPES, PKCE));
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/google-analytics/callback",
    );
    expect(u.searchParams.get("scope")).toBe(SCOPES.join(" "));
    expect(u.searchParams.get("access_type")).toBe("offline");
  });

  it("delegates PKCE to the shared S256 generator", () => {
    const pkce = googleAnalyticsOAuth.generatePkce!();
    expect(pkce.codeChallengeMethod).toBe("S256");
    expect(pkce.codeChallenge).toBe(
      createHash("sha256").update(pkce.codeVerifier).digest("base64url"),
    );
  });

  it("throws when pkce is null", () => {
    expect(() => googleAnalyticsOAuth.buildAuthUrl("S", SCOPES, null)).toThrow(
      /PKCE/,
    );
  });
});

describe("googleAnalyticsOAuth.handleCallback", () => {
  const PKCE_INPUTS = {
    codeVerifier: "verifier-secret-43chars",
    codeChallengeMethod: "S256",
  };

  it("exchanges code → tokens, resolves account via OIDC userinfo", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ya29.ga-access",
          refresh_token: "1//ga-refresh",
          expires_in: 3599,
          scope: SCOPES.join(" "),
        },
      },
      { ok: true, json: { email: "alice@example.com", sub: "uid-1", email_verified: true } },
    ]);

    const result = await googleAnalyticsOAuth.handleCallback(
      "AUTH_CODE",
      "STATE",
      PKCE_INPUTS,
    );

    expect(result.account.providerAccountId).toBe("alice@example.com");
    expect(result.account.displayName).toBe("alice@example.com");
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe("ya29.ga-access");
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe("1//ga-refresh");
  });

  it("throws when userinfo omits email", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ya29.ga-access",
          refresh_token: "1//ga-refresh",
          expires_in: 3599,
          scope: SCOPES.join(" "),
        },
      },
      { ok: true, json: { sub: "uid-1" } },
    ]);
    await expect(
      googleAnalyticsOAuth.handleCallback("CODE", "STATE", PKCE_INPUTS),
    ).rejects.toThrow(/missing email/);
  });

  it("throws when pkce is null", async () => {
    await expect(
      googleAnalyticsOAuth.handleCallback("CODE", "STATE", null),
    ).rejects.toThrow(/PKCE/);
  });
});
