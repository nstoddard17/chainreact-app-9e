/**
 * @jest-environment node
 *
 * Tests for microsoftOneDriveOAuth — the per-provider thin wrapper
 * around `_shared/microsoft/oauth.ts`.
 *
 * Strategy mirrors microsoft-outlook/oauth.test.ts and
 * microsoft-outlook-calendar/oauth.test.ts: the wire-format helpers are
 * tested in `_shared/microsoft/oauth.test.ts`. This file focuses on the
 * per-provider redirect URL + Graph /me fallback policy + ProviderOAuth
 * integration shape.
 */
import { decryptToken } from "@/core/encryption/tokens";
import { microsoftOneDriveOAuth } from "@/integrations/microsoft-onedrive/oauth";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 17) % 256;
  return bytes.toString("base64");
})();

beforeEach(() => {
  process.env.MICROSOFT_CLIENT_ID = "test-microsoft-client-id";
  process.env.MICROSOFT_CLIENT_SECRET = "test-microsoft-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MICROSOFT_CLIENT_ID;
  delete process.env.MICROSOFT_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.MICROSOFT_AUTHORIZE_BASE;
  delete process.env.MICROSOFT_TOKEN_BASE;
  delete process.env.MICROSOFT_GRAPH_API_BASE;
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

const SCOPES = ["offline_access", "Files.ReadWrite"] as const;

const PKCE_CHALLENGE = {
  codeChallenge: "fake-onedrive-challenge",
  codeChallengeMethod: "S256",
};

const PKCE_INPUTS = {
  codeVerifier: "verifier-43chars-onedrive-test-42",
  codeChallengeMethod: "S256",
};

// ─── generatePkce ───────────────────────────────────────────────────────────

describe("microsoftOneDriveOAuth.generatePkce", () => {
  it("delegates to the shared Microsoft PKCE generator", () => {
    expect(microsoftOneDriveOAuth.generatePkce).toBeDefined();
    const pkce = microsoftOneDriveOAuth.generatePkce!();
    expect(pkce.codeChallengeMethod).toBe("S256");
    expect(pkce.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

// ─── buildAuthUrl ───────────────────────────────────────────────────────────

describe("microsoftOneDriveOAuth.buildAuthUrl", () => {
  it("uses the OneDrive-specific redirect_uri (NOT mail's or calendar's)", () => {
    const url = microsoftOneDriveOAuth.buildAuthUrl(
      "STATE",
      SCOPES,
      PKCE_CHALLENGE,
    );
    const u = new URL(url);
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/microsoft-onedrive/callback",
    );
  });

  it("uses the multi-tenant /common/ authorize endpoint (shared)", () => {
    const url = microsoftOneDriveOAuth.buildAuthUrl(
      "STATE",
      SCOPES,
      PKCE_CHALLENGE,
    );
    expect(new URL(url).origin + new URL(url).pathname).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
  });

  it("requests OneDrive's two scopes space-separated", () => {
    const url = microsoftOneDriveOAuth.buildAuthUrl(
      "STATE",
      SCOPES,
      PKCE_CHALLENGE,
    );
    expect(new URL(url).searchParams.get("scope")).toBe(
      "offline_access Files.ReadWrite",
    );
  });

  it("throws when pkce is null (OneDrive requires PKCE)", () => {
    expect(() =>
      microsoftOneDriveOAuth.buildAuthUrl("S", SCOPES, null),
    ).toThrow(/PKCE/);
  });
});

// ─── handleCallback ─────────────────────────────────────────────────────────

describe("microsoftOneDriveOAuth.handleCallback", () => {
  it("posts the auth code + OneDrive redirect_uri + code_verifier to the shared token endpoint", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ms-onedrive-access",
          refresh_token: "ms-onedrive-refresh",
          expires_in: 3599,
          scope: "offline_access Files.ReadWrite",
          token_type: "Bearer",
        },
      },
      {
        ok: true,
        json: {
          id: "graph-uid-onedrive",
          mail: "alice@contoso.com",
          userPrincipalName: "alice@contoso.com",
        },
      },
    ]);

    await microsoftOneDriveOAuth.handleCallback(
      "auth-code",
      "state",
      PKCE_INPUTS,
    );

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    );
    const params = new URLSearchParams(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("code")).toBe("auth-code");
    expect(params.get("code_verifier")).toBe(PKCE_INPUTS.codeVerifier);
    expect(params.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/microsoft-onedrive/callback",
    );
  });

  it("calls Graph /me via the shared wrapper with the new access token", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ms-onedrive-access",
          refresh_token: "r",
          expires_in: 3599,
          scope: "Files.ReadWrite",
        },
      },
      {
        ok: true,
        json: {
          id: "uid-1",
          mail: "alice@contoso.com",
          userPrincipalName: "alice@contoso.com",
        },
      },
    ]);

    await microsoftOneDriveOAuth.handleCallback("c", "s", PKCE_INPUTS);

    expect(fetchSpy.mock.calls[1]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,id",
    );
    expect(fetchSpy.mock.calls[1]![1]!.headers).toEqual({
      Authorization: "Bearer ms-onedrive-access",
    });
  });

  it("encrypts both access and refresh tokens; decrypt round-trips", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "real-onedrive-access",
          refresh_token: "real-onedrive-refresh",
          expires_in: 3599,
          scope: "Files.ReadWrite",
        },
      },
      {
        ok: true,
        json: {
          id: "uid",
          mail: "alice@contoso.com",
          userPrincipalName: "alice@contoso.com",
        },
      },
    ]);

    const result = await microsoftOneDriveOAuth.handleCallback(
      "c",
      "s",
      PKCE_INPUTS,
    );

    expect(result.tokens.accessTokenEncrypted).not.toContain(
      "real-onedrive-access",
    );
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(
      "real-onedrive-access",
    );
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe(
      "real-onedrive-refresh",
    );
  });

  it("populates accountInfo from Graph /me 'mail' for work/school accounts", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 3599,
          scope: "Files.ReadWrite",
        },
      },
      {
        ok: true,
        json: {
          id: "graph-uid-work",
          mail: "bob@contoso.com",
          userPrincipalName: "bob@contoso.com",
        },
      },
    ]);

    const result = await microsoftOneDriveOAuth.handleCallback(
      "c",
      "s",
      PKCE_INPUTS,
    );

    expect(result.account.providerAccountId).toBe("bob@contoso.com");
    expect(result.account.displayName).toBe("bob@contoso.com");
    expect(result.account.metadata).toEqual({
      email: "bob@contoso.com",
      graphId: "graph-uid-work",
      mailField: "mail",
    });
  });

  it("falls back to userPrincipalName when mail is null (consumer account)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 3599,
          scope: "Files.ReadWrite",
        },
      },
      {
        ok: true,
        json: {
          id: "consumer-uid",
          mail: null,
          userPrincipalName: "alice@outlook.com",
        },
      },
    ]);

    const result = await microsoftOneDriveOAuth.handleCallback(
      "c",
      "s",
      PKCE_INPUTS,
    );

    expect(result.account.providerAccountId).toBe("alice@outlook.com");
    expect(result.account.metadata).toEqual({
      email: "alice@outlook.com",
      graphId: "consumer-uid",
      mailField: "userPrincipalName",
    });
  });

  it("throws when both mail and userPrincipalName are missing", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 3599,
          scope: "Files.ReadWrite",
        },
      },
      { ok: true, json: { id: "uid-only" } },
    ]);

    await expect(
      microsoftOneDriveOAuth.handleCallback("c", "s", PKCE_INPUTS),
    ).rejects.toThrow(/missing both mail and userPrincipalName/);
  });

  it("throws when pkce is null", async () => {
    await expect(
      microsoftOneDriveOAuth.handleCallback("c", "s", null),
    ).rejects.toThrow(/PKCE code_verifier is required/);
  });

  it("throws when pkce.codeVerifier is empty", async () => {
    await expect(
      microsoftOneDriveOAuth.handleCallback("c", "s", {
        codeVerifier: "",
        codeChallengeMethod: "S256",
      }),
    ).rejects.toThrow(/PKCE code_verifier is required/);
  });
});

// ─── refreshToken ───────────────────────────────────────────────────────────

describe("microsoftOneDriveOAuth.refreshToken", () => {
  it("delegates to the shared Microsoft refresh helper (preserve-old policy)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "new-onedrive-access",
          // No rotation — preserve-old applies.
          expires_in: 3599,
          scope: "Files.ReadWrite",
        },
      },
    ]);

    const result = await microsoftOneDriveOAuth.refreshToken(
      "original-onedrive-refresh",
    );

    expect(decryptToken(result.refreshTokenEncrypted!)).toBe(
      "original-onedrive-refresh",
    );
    expect(decryptToken(result.accessTokenEncrypted)).toBe(
      "new-onedrive-access",
    );
  });
});

// ─── revoke ─────────────────────────────────────────────────────────────────

describe("microsoftOneDriveOAuth.revoke", () => {
  it("is a no-op stub (matches every other V2 provider)", async () => {
    await expect(
      microsoftOneDriveOAuth.revoke("any-token"),
    ).resolves.toBeUndefined();
  });
});
