/**
 * @jest-environment node
 *
 * Tests for microsoftTeamsOAuth — the per-provider thin wrapper
 * around `_shared/microsoft/oauth.ts`.
 *
 * Strategy mirrors microsoft-outlook / microsoft-outlook-calendar /
 * microsoft-onedrive / microsoft-excel oauth tests: the wire-format
 * helpers are tested in `_shared/microsoft/oauth.test.ts`. This file
 * focuses on:
 *   - Teams-specific redirect URL.
 *   - Graph /me fallback policy ('mail ?? userPrincipalName').
 *   - ProviderOAuth integration shape.
 *   - Anti-tests proving V1's `TEAMS_*` env vars + app-only flow are
 *     not read.
 */
import { decryptToken } from "@/core/encryption/tokens";
import { microsoftTeamsOAuth } from "@/integrations/microsoft-teams/oauth";

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
  // Slice 16 anti-test guarantee: even when these stale-V1 env vars are
  // set, the Teams OAuth wrapper must ignore them. We set them here so
  // a regression that started reading them would surface as a passing
  // wrong-value test rather than a silently-missing assertion.
  process.env.TEAMS_CLIENT_ID = "stale-v1-teams-client-id";
  process.env.TEAMS_CLIENT_SECRET = "stale-v1-teams-client-secret";
  process.env.TEAMS_TENANT_ID = "stale-v1-teams-tenant-id";
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
  delete process.env.TEAMS_CLIENT_ID;
  delete process.env.TEAMS_CLIENT_SECRET;
  delete process.env.TEAMS_TENANT_ID;
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

const SCOPES = [
  "offline_access",
  "User.Read",
  "ChannelMessage.Send",
  "ChannelMessage.Read.All",
  "Channel.ReadBasic.All",
  "Team.ReadBasic.All",
  "TeamMember.Read.All",
  "Chat.ReadWrite",
] as const;

const PKCE_CHALLENGE = {
  codeChallenge: "fake-teams-challenge",
  codeChallengeMethod: "S256",
};

const PKCE_INPUTS = {
  codeVerifier: "verifier-43chars-teams-test-1234567890ab",
  codeChallengeMethod: "S256",
};

// ─── generatePkce ───────────────────────────────────────────────────────────

describe("microsoftTeamsOAuth.generatePkce", () => {
  it("delegates to the shared Microsoft PKCE generator", () => {
    expect(microsoftTeamsOAuth.generatePkce).toBeDefined();
    const pkce = microsoftTeamsOAuth.generatePkce!();
    expect(pkce.codeChallengeMethod).toBe("S256");
    expect(pkce.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

// ─── buildAuthUrl ───────────────────────────────────────────────────────────

describe("microsoftTeamsOAuth.buildAuthUrl", () => {
  it("uses the Teams-specific redirect_uri (NOT mail's, calendar's, OneDrive's, or Excel's)", () => {
    const url = microsoftTeamsOAuth.buildAuthUrl(
      "STATE",
      SCOPES,
      PKCE_CHALLENGE,
    );
    const u = new URL(url);
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/microsoft-teams/callback",
    );
  });

  it("uses the multi-tenant /common/ authorize endpoint (shared)", () => {
    const url = microsoftTeamsOAuth.buildAuthUrl(
      "STATE",
      SCOPES,
      PKCE_CHALLENGE,
    );
    expect(new URL(url).origin + new URL(url).pathname).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
  });

  it("requests the Batch 1 scopes space-separated", () => {
    const url = microsoftTeamsOAuth.buildAuthUrl(
      "STATE",
      SCOPES,
      PKCE_CHALLENGE,
    );
    expect(new URL(url).searchParams.get("scope")).toBe(
      "offline_access User.Read ChannelMessage.Send ChannelMessage.Read.All Channel.ReadBasic.All Team.ReadBasic.All TeamMember.Read.All Chat.ReadWrite",
    );
  });

  it("does NOT use a tenant-specific authorize endpoint (Batch 1 is multi-tenant /common/)", () => {
    // Anti-test. V1's app-only flow uses `/{tenantId}/oauth2/v2.0/token`.
    // Batch 1 is 100% delegated-user and goes through /common/ only.
    const url = microsoftTeamsOAuth.buildAuthUrl(
      "STATE",
      SCOPES,
      PKCE_CHALLENGE,
    );
    expect(new URL(url).pathname).not.toMatch(
      /\/[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}\//,
    );
    expect(new URL(url).pathname).toContain("/common/");
  });

  it("throws when pkce is null (Teams requires PKCE)", () => {
    expect(() => microsoftTeamsOAuth.buildAuthUrl("S", SCOPES, null)).toThrow(
      /PKCE/,
    );
  });
});

// ─── handleCallback ─────────────────────────────────────────────────────────

describe("microsoftTeamsOAuth.handleCallback", () => {
  it("posts the auth code + Teams redirect_uri + code_verifier to the shared token endpoint", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ms-teams-access",
          refresh_token: "ms-teams-refresh",
          expires_in: 3599,
          scope: SCOPES.join(" "),
          token_type: "Bearer",
        },
      },
      {
        ok: true,
        json: {
          id: "graph-uid-teams",
          mail: "alice@contoso.com",
          userPrincipalName: "alice@contoso.com",
        },
      },
    ]);

    await microsoftTeamsOAuth.handleCallback(
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
      "https://app.example.test/api/integrations/oauth/microsoft-teams/callback",
    );
    // V2 anti-rot: token exchange uses the SHARED Microsoft client_id,
    // not the V1 TEAMS_CLIENT_ID silo.
    expect(params.get("client_id")).toBe("test-microsoft-client-id");
    expect(params.get("client_id")).not.toBe("stale-v1-teams-client-id");
    expect(params.get("client_secret")).toBe("test-microsoft-client-secret");
    expect(params.get("client_secret")).not.toBe(
      "stale-v1-teams-client-secret",
    );
  });

  it("does NOT use client_credentials grant — Batch 1 is delegated-user only", async () => {
    // Anti-test. V1's `getAppOnlyAccessToken` POSTs grant_type=client_credentials.
    // Batch 1 must only ever issue grant_type=authorization_code on
    // handleCallback (and grant_type=refresh_token on refreshToken).
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "a",
          refresh_token: "r",
          expires_in: 3599,
          scope: "User.Read",
        },
      },
      { ok: true, json: { id: "u", mail: "x@y.test" } },
    ]);

    await microsoftTeamsOAuth.handleCallback("c", "s", PKCE_INPUTS);

    const params = new URLSearchParams(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("grant_type")).not.toBe("client_credentials");
  });

  it("calls Graph /me via the shared wrapper with the new access token", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ms-teams-access",
          refresh_token: "r",
          expires_in: 3599,
          scope: "User.Read ChannelMessage.Send",
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

    await microsoftTeamsOAuth.handleCallback("c", "s", PKCE_INPUTS);

    expect(fetchSpy.mock.calls[1]![0]).toBe(
      "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,id",
    );
    expect(fetchSpy.mock.calls[1]![1]!.headers).toEqual({
      Authorization: "Bearer ms-teams-access",
    });
  });

  it("encrypts both access and refresh tokens; decrypt round-trips", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "real-teams-access",
          refresh_token: "real-teams-refresh",
          expires_in: 3599,
          scope: "User.Read",
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

    const result = await microsoftTeamsOAuth.handleCallback(
      "c",
      "s",
      PKCE_INPUTS,
    );

    expect(result.tokens.accessTokenEncrypted).not.toContain(
      "real-teams-access",
    );
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(
      "real-teams-access",
    );
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe(
      "real-teams-refresh",
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
          scope: "User.Read",
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

    const result = await microsoftTeamsOAuth.handleCallback(
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
          scope: "User.Read",
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

    const result = await microsoftTeamsOAuth.handleCallback(
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
          scope: "User.Read",
        },
      },
      { ok: true, json: { id: "uid-only" } },
    ]);

    await expect(
      microsoftTeamsOAuth.handleCallback("c", "s", PKCE_INPUTS),
    ).rejects.toThrow(/missing both mail and userPrincipalName/);
  });

  it("throws when pkce is null", async () => {
    await expect(
      microsoftTeamsOAuth.handleCallback("c", "s", null),
    ).rejects.toThrow(/PKCE code_verifier is required/);
  });

  it("throws when pkce.codeVerifier is empty", async () => {
    await expect(
      microsoftTeamsOAuth.handleCallback("c", "s", {
        codeVerifier: "",
        codeChallengeMethod: "S256",
      }),
    ).rejects.toThrow(/PKCE code_verifier is required/);
  });
});

// ─── refreshToken ───────────────────────────────────────────────────────────

describe("microsoftTeamsOAuth.refreshToken", () => {
  it("delegates to the shared Microsoft refresh helper (preserve-old policy)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "new-teams-access",
          // No rotation — preserve-old applies.
          expires_in: 3599,
          scope: "User.Read ChannelMessage.Send",
        },
      },
    ]);

    const result = await microsoftTeamsOAuth.refreshToken(
      "original-teams-refresh",
    );

    expect(decryptToken(result.refreshTokenEncrypted!)).toBe(
      "original-teams-refresh",
    );
    expect(decryptToken(result.accessTokenEncrypted)).toBe("new-teams-access");
  });

  it("uses the shared Microsoft client_id/secret (NOT V1's TEAMS_*)", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "new-teams-access",
          expires_in: 3599,
          scope: "User.Read",
        },
      },
    ]);

    await microsoftTeamsOAuth.refreshToken("refresh-token");

    const params = new URLSearchParams(
      fetchSpy.mock.calls[0]![1]!.body as string,
    );
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("client_id")).toBe("test-microsoft-client-id");
    expect(params.get("client_id")).not.toBe("stale-v1-teams-client-id");
    expect(params.get("client_secret")).toBe("test-microsoft-client-secret");
  });
});

// ─── revoke ─────────────────────────────────────────────────────────────────

describe("microsoftTeamsOAuth.revoke", () => {
  it("is a no-op stub (matches every other V2 provider)", async () => {
    await expect(
      microsoftTeamsOAuth.revoke("any-token"),
    ).resolves.toBeUndefined();
  });
});
