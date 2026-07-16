/**
 * @jest-environment node
 *
 * Tests for the Power BI OAuth implementation — specifically the
 * id_token identity path (Power BI-audience access tokens cannot call
 * Graph /me, so callback identity comes from the OIDC id_token).
 */

const mockExchange = jest.fn();

jest.mock("@/integrations/_shared/microsoft/oauth", () => {
  const actual = jest.requireActual("@/integrations/_shared/microsoft/oauth");
  return {
    ...actual,
    exchangeMicrosoftAuthCode: (...args: unknown[]) => mockExchange(...args),
  };
});

jest.mock("@/core/encryption/tokens", () => ({
  encryptToken: (plain: string) => `enc(${plain})`,
}));

import {
  decodeIdTokenClaims,
  microsoftPowerBiOAuth,
} from "@/integrations/microsoft-powerbi/oauth";

function fakeIdToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString(
    "base64url",
  );
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.sig`;
}

const PKCE = {
  codeVerifier: "ver",
  codeChallenge: "chal",
  codeChallengeMethod: "S256",
};

beforeEach(() => {
  mockExchange.mockReset();
});

describe("decodeIdTokenClaims", () => {
  it("decodes email / preferred_username / oid claims", () => {
    const claims = decodeIdTokenClaims(
      fakeIdToken({
        email: "alice@contoso.com",
        preferred_username: "alice.upn@contoso.com",
        oid: "oid-1",
        aud: "ignored",
      }),
    );
    expect(claims.email).toBe("alice@contoso.com");
    expect(claims.preferred_username).toBe("alice.upn@contoso.com");
    expect(claims.oid).toBe("oid-1");
  });

  it("throws on a malformed token", () => {
    expect(() => decodeIdTokenClaims("not-a-jwt")).toThrow(/well-formed/);
    expect(() => decodeIdTokenClaims("a.%%%.c")).toThrow();
  });
});

describe("microsoftPowerBiOAuth.handleCallback", () => {
  function exchangeResult(overrides: Record<string, unknown> = {}) {
    return {
      accessToken: "at-1",
      refreshToken: "rt-1",
      expiresAt: 1_800_000_000,
      scopesGranted: ["https://analysis.windows.net/powerbi/api/Dataset.ReadWrite.All"],
      idToken: fakeIdToken({
        email: "alice@contoso.com",
        preferred_username: "alice.upn@contoso.com",
        oid: "oid-1",
      }),
      ...overrides,
    };
  }

  it("resolves identity from the id_token email claim", async () => {
    mockExchange.mockResolvedValueOnce(exchangeResult());

    const result = await microsoftPowerBiOAuth.handleCallback(
      "code-1",
      "state-1",
      PKCE,
    );

    expect(result.account.providerAccountId).toBe("alice@contoso.com");
    expect(result.account.metadata).toMatchObject({
      email: "alice@contoso.com",
      emailClaim: "email",
      entraObjectId: "oid-1",
    });
    expect(result.tokens.accessTokenEncrypted).toBe("enc(at-1)");
    expect(result.tokens.refreshTokenEncrypted).toBe("enc(rt-1)");
  });

  it("falls back to preferred_username when email is absent", async () => {
    mockExchange.mockResolvedValueOnce(
      exchangeResult({
        idToken: fakeIdToken({ preferred_username: "alice.upn@contoso.com" }),
      }),
    );

    const result = await microsoftPowerBiOAuth.handleCallback(
      "code-1",
      "state-1",
      PKCE,
    );
    expect(result.account.providerAccountId).toBe("alice.upn@contoso.com");
    expect(result.account.metadata).toMatchObject({
      emailClaim: "preferred_username",
    });
  });

  it("fails loud when the id_token is missing", async () => {
    mockExchange.mockResolvedValueOnce(exchangeResult({ idToken: null }));
    await expect(
      microsoftPowerBiOAuth.handleCallback("code-1", "state-1", PKCE),
    ).rejects.toThrow(/missing id_token/);
  });

  it("fails loud when both identity claims are missing", async () => {
    mockExchange.mockResolvedValueOnce(
      exchangeResult({ idToken: fakeIdToken({ oid: "only-oid" }) }),
    );
    await expect(
      microsoftPowerBiOAuth.handleCallback("code-1", "state-1", PKCE),
    ).rejects.toThrow(/email and preferred_username/);
  });

  it("requires PKCE", async () => {
    await expect(
      microsoftPowerBiOAuth.handleCallback("code-1", "state-1", null),
    ).rejects.toThrow(/PKCE/);
    expect(mockExchange).not.toHaveBeenCalled();
  });
});
