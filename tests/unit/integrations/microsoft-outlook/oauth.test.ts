/**
 * @jest-environment node
 *
 * Tests for microsoftOutlookOAuth.
 *
 * Strategy mirrors google-sheets/oauth.test.ts: mock global fetch so token
 * exchange + Graph /me lookup + refresh hit a captured handler. We focus on
 * Microsoft-specific behavior (multi-tenant /common/ endpoint, mail vs
 * userPrincipalName fallback, refresh-token rotation/preserve-old policy)
 * rather than reasserting every shared-shape detail Slack/Gmail tests cover.
 */
import { createHash } from "node:crypto";
import { microsoftOutlookOAuth } from "@/integrations/microsoft-outlook/oauth";
import { decryptToken } from "@/core/encryption/tokens";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 13) % 256;
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

const SCOPES = ["offline_access", "Mail.Send", "Mail.Read"] as const;

const PKCE_CHALLENGE = {
  codeChallenge: "fake-microsoft-challenge",
  codeChallengeMethod: "S256",
};

const PKCE_INPUTS = {
  codeVerifier: "verifier-43chars-microsoft-test",
  codeChallengeMethod: "S256",
};

// ─── generatePkce ───────────────────────────────────────────────────────────

describe("microsoftOutlookOAuth.generatePkce", () => {
  it("returns S256 PKCE pair with verifier hashed to challenge", () => {
    expect(microsoftOutlookOAuth.generatePkce).toBeDefined();
    const pkce = microsoftOutlookOAuth.generatePkce!();
    expect(pkce.codeChallengeMethod).toBe("S256");
    expect(pkce.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const expected = createHash("sha256")
      .update(pkce.codeVerifier)
      .digest("base64url");
    expect(pkce.codeChallenge).toBe(expected);
  });
});

// ─── buildAuthUrl ───────────────────────────────────────────────────────────

describe("microsoftOutlookOAuth.buildAuthUrl", () => {
  it("uses the multi-tenant /common/ authorize endpoint", () => {
    const url = microsoftOutlookOAuth.buildAuthUrl(
      "STATE-TOKEN",
      SCOPES,
      PKCE_CHALLENGE,
    );
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
  });

  it("uses the Outlook-specific redirect_uri", () => {
    const url = microsoftOutlookOAuth.buildAuthUrl(
      "STATE-TOKEN",
      SCOPES,
      PKCE_CHALLENGE,
    );
    const u = new URL(url);
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/microsoft-outlook/callback",
    );
  });

  it("requests scopes space-separated (Microsoft v2 endpoint format)", () => {
    const url = microsoftOutlookOAuth.buildAuthUrl(
      "STATE-TOKEN",
      SCOPES,
      PKCE_CHALLENGE,
    );
    const u = new URL(url);
    expect(u.searchParams.get("scope")).toBe(SCOPES.join(" "));
  });

  it("includes response_type=code, response_mode=query, and PKCE params", () => {
    const url = microsoftOutlookOAuth.buildAuthUrl(
      "STATE",
      SCOPES,
      PKCE_CHALLENGE,
    );
    const u = new URL(url);
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("response_mode")).toBe("query");
    expect(u.searchParams.get("code_challenge")).toBe(
      "fake-microsoft-challenge",
    );
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe("STATE");
    expect(u.searchParams.get("client_id")).toBe("test-microsoft-client-id");
  });

  it("throws when pkce is null (Microsoft requires PKCE in V2)", () => {
    expect(() =>
      microsoftOutlookOAuth.buildAuthUrl("S", SCOPES, null),
    ).toThrow(/PKCE/);
  });

  it("throws when MICROSOFT_CLIENT_ID is unset", () => {
    delete process.env.MICROSOFT_CLIENT_ID;
    expect(() =>
      microsoftOutlookOAuth.buildAuthUrl("S", SCOPES, PKCE_CHALLENGE),
    ).toThrow(/MICROSOFT_CLIENT_ID/);
  });

  it("uses MICROSOFT_AUTHORIZE_BASE override when set", () => {
    process.env.MICROSOFT_AUTHORIZE_BASE = "http://127.0.0.1:9876";
    const url = microsoftOutlookOAuth.buildAuthUrl(
      "S",
      SCOPES,
      PKCE_CHALLENGE,
    );
    expect(new URL(url).origin).toBe("http://127.0.0.1:9876");
  });
});

// ─── handleCallback ─────────────────────────────────────────────────────────

describe("microsoftOutlookOAuth.handleCallback", () => {
  it("posts the auth code to the Microsoft /common/ token endpoint with code_verifier", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ms-access-token",
          refresh_token: "ms-refresh-token",
          expires_in: 3599,
          scope: "offline_access Mail.Send Mail.Read",
          token_type: "Bearer",
        },
      },
      {
        ok: true,
        json: {
          id: "graph-uid-1",
          mail: "alice@contoso.com",
          userPrincipalName: "alice@contoso.com",
        },
      },
    ]);

    await microsoftOutlookOAuth.handleCallback("auth-code", "state", PKCE_INPUTS);

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }),
    );
    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("auth-code");
    expect(params.get("code_verifier")).toBe(PKCE_INPUTS.codeVerifier);
    expect(params.get("client_id")).toBe("test-microsoft-client-id");
    expect(params.get("client_secret")).toBe("test-microsoft-client-secret");
    expect(params.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/microsoft-outlook/callback",
    );
  });

  it("calls Graph /me with $select=mail,userPrincipalName,id and Bearer token", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ms-access",
          refresh_token: "ms-refresh",
          expires_in: 3599,
          scope: "Mail.Read",
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

    await microsoftOutlookOAuth.handleCallback("c", "s", PKCE_INPUTS);

    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,id",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer ms-access" },
      }),
    );
  });

  it("encrypts both access and refresh tokens; decrypt round-trips", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "real-access",
          refresh_token: "real-refresh",
          expires_in: 3599,
          scope: "Mail.Send",
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

    const result = await microsoftOutlookOAuth.handleCallback(
      "c",
      "s",
      PKCE_INPUTS,
    );

    expect(result.tokens.accessTokenEncrypted).not.toContain("real-access");
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(
      "real-access",
    );
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe(
      "real-refresh",
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
          scope: "Mail.Send",
        },
      },
      {
        ok: true,
        json: {
          id: "graph-uid-99",
          mail: "bob@contoso.com",
          userPrincipalName: "bob@contoso.com",
          displayName: "Bob",
        },
      },
    ]);

    const result = await microsoftOutlookOAuth.handleCallback(
      "c",
      "s",
      PKCE_INPUTS,
    );

    expect(result.account.providerAccountId).toBe("bob@contoso.com");
    expect(result.account.displayName).toBe("bob@contoso.com");
    expect(result.account.metadata).toEqual({
      email: "bob@contoso.com",
      graphId: "graph-uid-99",
      mailField: "mail",
    });
  });

  it("falls back to userPrincipalName when mail is null (consumer account)", async () => {
    // V1 + Microsoft docs: consumer accounts (outlook.com / hotmail.com)
    // can return mail: null at consent time if the mailbox isn't fully
    // provisioned. UPN is the sign-in identifier and is always present.
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 3599,
          scope: "Mail.Send",
        },
      },
      {
        ok: true,
        json: {
          id: "consumer-graph-uid",
          mail: null,
          userPrincipalName: "alice@outlook.com",
        },
      },
    ]);

    const result = await microsoftOutlookOAuth.handleCallback(
      "c",
      "s",
      PKCE_INPUTS,
    );

    expect(result.account.providerAccountId).toBe("alice@outlook.com");
    expect(result.account.metadata).toEqual({
      email: "alice@outlook.com",
      graphId: "consumer-graph-uid",
      // mailField records that we resolved from UPN, not mail — useful
      // for analytics on work-vs-consumer breakdown.
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
          scope: "Mail.Send",
        },
      },
      { ok: true, json: { id: "uid-only" } }, // neither mail nor UPN
    ]);

    await expect(
      microsoftOutlookOAuth.handleCallback("c", "s", PKCE_INPUTS),
    ).rejects.toThrow(/missing both mail and userPrincipalName/);
  });

  it("throws when pkce is null", async () => {
    await expect(
      microsoftOutlookOAuth.handleCallback("c", "s", null),
    ).rejects.toThrow(/PKCE code_verifier is required/);
  });

  it("throws when pkce.codeVerifier is empty", async () => {
    await expect(
      microsoftOutlookOAuth.handleCallback("c", "s", {
        codeVerifier: "",
        codeChallengeMethod: "S256",
      }),
    ).rejects.toThrow(/PKCE code_verifier is required/);
  });

  it("surfaces Microsoft's error code on token-exchange HTTP error", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: {
          error: "invalid_grant",
          error_description: "AADSTS70008: code expired",
        },
      },
    ]);
    await expect(
      microsoftOutlookOAuth.handleCallback("bad-code", "s", PKCE_INPUTS),
    ).rejects.toThrow(/invalid_grant/);
  });

  it("throws when token response is missing refresh_token (offline_access misconfig)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          // no refresh_token — manifest requires offline_access which
          // should always issue one. Indicates client config drift.
          expires_in: 3599,
          scope: "Mail.Send",
        },
      },
    ]);
    await expect(
      microsoftOutlookOAuth.handleCallback("c", "s", PKCE_INPUTS),
    ).rejects.toThrow(/missing refresh_token/);
  });

  it("uses MICROSOFT_TOKEN_BASE + MICROSOFT_GRAPH_API_BASE overrides when set", async () => {
    process.env.MICROSOFT_TOKEN_BASE = "http://127.0.0.1:9876";
    process.env.MICROSOFT_GRAPH_API_BASE = "http://127.0.0.1:9876";
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 3599,
          scope: "Mail.Send",
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

    await microsoftOutlookOAuth.handleCallback("c", "s", PKCE_INPUTS);

    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://127.0.0.1:9876/common/oauth2/v2.0/token",
    );
    expect(fetchSpy.mock.calls[1]![0]).toBe(
      "http://127.0.0.1:9876/v1.0/me?$select=mail,userPrincipalName,id",
    );
  });
});

// ─── refreshToken ───────────────────────────────────────────────────────────

describe("microsoftOutlookOAuth.refreshToken", () => {
  it("preserves the old refresh token when Microsoft omits one (preserve-old policy)", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "new-access",
          // Microsoft typically rotates but spec-allows omission.
          // Mirror Google's preserve-old policy.
          expires_in: 3599,
          scope: "Mail.Send",
        },
      },
    ]);

    const result =
      await microsoftOutlookOAuth.refreshToken("original-refresh");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(decryptToken(result.refreshTokenEncrypted!)).toBe(
      "original-refresh",
    );
    expect(decryptToken(result.accessTokenEncrypted)).toBe("new-access");
  });

  it("uses the rotated refresh_token when Microsoft returns one", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "new-access",
          refresh_token: "rotated-refresh",
          expires_in: 3599,
          scope: "Mail.Send",
        },
      },
    ]);

    const result = await microsoftOutlookOAuth.refreshToken("old");

    expect(decryptToken(result.refreshTokenEncrypted!)).toBe(
      "rotated-refresh",
    );
  });

  it("posts grant_type=refresh_token with client credentials", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          expires_in: 3599,
          scope: "Mail.Send",
        },
      },
    ]);

    await microsoftOutlookOAuth.refreshToken("token-secret");

    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("token-secret");
    expect(params.get("client_id")).toBe("test-microsoft-client-id");
    expect(params.get("client_secret")).toBe("test-microsoft-client-secret");
  });

  it("computes accessTokenExpiresAt from expires_in seconds", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          expires_in: 3599,
          scope: "Mail.Send",
        },
      },
    ]);

    const before = Math.floor(Date.now() / 1000);
    const result = await microsoftOutlookOAuth.refreshToken("rt");
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
    await expect(
      microsoftOutlookOAuth.refreshToken("dead-token"),
    ).rejects.toThrow(/invalid_grant/);
  });
});

// ─── revoke ─────────────────────────────────────────────────────────────────

describe("microsoftOutlookOAuth.revoke", () => {
  it("is a no-op stub (matches Gmail/Calendar/Drive/Sheets/Slack pattern)", async () => {
    await expect(
      microsoftOutlookOAuth.revoke("any-token"),
    ).resolves.toBeUndefined();
  });
});
