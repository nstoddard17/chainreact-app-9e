/**
 * @jest-environment node
 *
 * Tests for hubspotOAuth — V2's first CRM provider. Mocks the global
 * fetch so we don't hit HubSpot. Verifies:
 *   - No PKCE — `generatePkce` is omitted; authorize URL has no
 *     `code_challenge` params (V1 generated a verifier but never sent
 *     a challenge — V2 doesn't reproduce that dead-code path).
 *   - Authorize URL wire-format: client_id, redirect_uri, scope, state.
 *     Scopes space-separated.
 *   - Token exchange wire-format: BODY-AUTH (client_id + client_secret
 *     in form body, NOT in Authorization header),
 *     application/x-www-form-urlencoded, redirect_uri included.
 *   - hubId resolution via /oauth/v1/access-tokens primary; fallback to
 *     /integrations/v1/me.
 *   - Refresh-token PRESERVATION invariant: when the refresh response
 *     omits refresh_token, V2 PRESERVES the original; when present, V2
 *     PERSISTS the new value. Distinguishes HubSpot from Airtable
 *     (mandatory rotation).
 *   - Refresh body includes redirect_uri (per V1's
 *     sendRedirectUriWithRefresh: true).
 */
import { randomBytes } from "node:crypto";
import { hubspotOAuth } from "@/integrations/hubspot/oauth";
import { decryptToken } from "@/core/encryption/tokens";

const TOKEN_KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.HUBSPOT_CLIENT_ID = "test-hubspot-client-id";
  process.env.HUBSPOT_CLIENT_SECRET = "test-hubspot-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.HUBSPOT_CLIENT_ID;
  delete process.env.HUBSPOT_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.HUBSPOT_AUTHORIZE_BASE;
  delete process.env.HUBSPOT_TOKEN_BASE;
  delete process.env.HUBSPOT_API_BASE;
});

function mockFetchSequence(
  responses: Array<{
    ok: boolean;
    status?: number;
    json?: unknown;
    text?: string;
  }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    const body = r.text !== undefined ? r.text : JSON.stringify(r.json ?? {});
    spy.mockResolvedValueOnce(
      new Response(body, {
        status: r.status ?? (r.ok ? 200 : 500),
      }),
    );
  }
  return spy;
}

const SCOPES = [
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "oauth",
] as const;

const EXPECTED_REDIRECT =
  "https://app.example.test/api/integrations/oauth/hubspot/callback";

// ─── generatePkce — absent ──────────────────────────────────────────────────

describe("hubspotOAuth.generatePkce", () => {
  it("is undefined (HubSpot does not use PKCE)", () => {
    // Slice 13 §2: V1 generates a code_verifier and writes it to a
    // pkce_flow table but never sends code_challenge in the authorize
    // URL — dead code. V2 doesn't reproduce.
    expect(hubspotOAuth.generatePkce).toBeUndefined();
  });
});

// ─── buildAuthUrl ───────────────────────────────────────────────────────────

describe("hubspotOAuth.buildAuthUrl", () => {
  it("produces a HubSpot authorize URL with all required params", () => {
    const url = hubspotOAuth.buildAuthUrl("STATE-TOKEN", SCOPES, null);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://app.hubspot.com/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("test-hubspot-client-id");
    expect(u.searchParams.get("state")).toBe("STATE-TOKEN");
    expect(u.searchParams.get("redirect_uri")).toBe(EXPECTED_REDIRECT);
  });

  it("requests scopes space-separated (HubSpot wire-format)", () => {
    const url = hubspotOAuth.buildAuthUrl("S", SCOPES, null);
    expect(new URL(url).searchParams.get("scope")).toBe(
      "crm.objects.contacts.read crm.objects.contacts.write oauth",
    );
  });

  it("does NOT include PKCE params (HubSpot does not require them)", () => {
    const url = hubspotOAuth.buildAuthUrl("S", SCOPES, null);
    const u = new URL(url);
    expect(u.searchParams.get("code_challenge")).toBeNull();
    expect(u.searchParams.get("code_challenge_method")).toBeNull();
  });

  it("ignores any pkce parameter passed (defensive — dispatcher should pass null)", () => {
    const url = hubspotOAuth.buildAuthUrl("S", SCOPES, {
      codeChallenge: "should-not-appear",
      codeChallengeMethod: "S256",
    });
    expect(url).not.toContain("code_challenge");
    expect(url).not.toContain("should-not-appear");
  });

  it("throws when HUBSPOT_CLIENT_ID is not set", () => {
    delete process.env.HUBSPOT_CLIENT_ID;
    expect(() => hubspotOAuth.buildAuthUrl("S", SCOPES, null)).toThrow(
      /HUBSPOT_CLIENT_ID/,
    );
  });

  it("falls back to localhost redirect_uri when NEXT_PUBLIC_APP_URL is not set", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const url = hubspotOAuth.buildAuthUrl("S", SCOPES, null);
    expect(new URL(url).searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/integrations/oauth/hubspot/callback",
    );
  });

  it("uses HUBSPOT_AUTHORIZE_BASE override when set (e2e mock surface)", () => {
    process.env.HUBSPOT_AUTHORIZE_BASE = "http://localhost:9883";
    const url = hubspotOAuth.buildAuthUrl("S", SCOPES, null);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "http://localhost:9883/oauth/authorize",
    );
  });

  it("defaults to app.hubspot.com when HUBSPOT_AUTHORIZE_BASE is unset (production-safe)", () => {
    delete process.env.HUBSPOT_AUTHORIZE_BASE;
    const url = hubspotOAuth.buildAuthUrl("S", SCOPES, null);
    expect(new URL(url).origin).toBe("https://app.hubspot.com");
  });
});

// ─── handleCallback ─────────────────────────────────────────────────────────

describe("hubspotOAuth.handleCallback", () => {
  it("posts BODY-AUTH form-encoded body to /oauth/v1/token (no Authorization header, client_id+client_secret in body)", async () => {
    const fetchSpy = mockFetchSequence([
      // Token exchange
      {
        ok: true,
        json: {
          access_token: "ha_test_access_xyz",
          refresh_token: "hr_test_refresh_xyz",
          expires_in: 21600,
          scope: "crm.objects.contacts.read crm.objects.contacts.write oauth",
          token_type: "bearer",
        },
      },
      // Account-info primary
      {
        ok: true,
        json: {
          user: "alice@example.com",
          user_id: 4567,
          hub_id: 123456,
          hub_domain: "alice-test-portal.hubspot.com",
        },
      },
    ]);

    await hubspotOAuth.handleCallback("auth-code-1", "state", null);

    // 2 calls: token exchange + account-info primary.
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0]!;
    expect(tokenUrl).toBe("https://api.hubapi.com/oauth/v1/token");
    expect(tokenInit!.method).toBe("POST");
    const headers = tokenInit!.headers as Record<string, string>;
    // Body-auth: NO Authorization header.
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const params = new URLSearchParams(tokenInit!.body as string);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("auth-code-1");
    // client_id + client_secret IS in the body for HubSpot.
    expect(params.get("client_id")).toBe("test-hubspot-client-id");
    expect(params.get("client_secret")).toBe("test-hubspot-client-secret");
    // HubSpot's token exchange requires redirect_uri in the body.
    expect(params.get("redirect_uri")).toBe(EXPECTED_REDIRECT);
  });

  it("calls /oauth/v1/access-tokens/{token} for hubId resolution (primary endpoint)", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 21600,
          scope: "oauth",
        },
      },
      {
        ok: true,
        json: {
          user: "bob@example.com",
          user_id: 7890,
          hub_id: 555000,
          hub_domain: "bob-portal",
        },
      },
    ]);

    await hubspotOAuth.handleCallback("c", "s", null);

    const [accountUrl] = fetchSpy.mock.calls[1]!;
    expect(accountUrl).toBe("https://api.hubapi.com/oauth/v1/access-tokens/x");
  });

  it("falls back to /integrations/v1/me when /oauth/v1/access-tokens fails", async () => {
    const fetchSpy = mockFetchSequence([
      // Token exchange success
      {
        ok: true,
        json: {
          access_token: "tok",
          refresh_token: "ref",
          expires_in: 21600,
          scope: "oauth",
        },
      },
      // Primary account-info: 500 server error
      { ok: false, status: 500, json: { error: "transient" } },
      // Fallback /integrations/v1/me
      {
        ok: true,
        json: {
          portalId: 999111,
          userId: 4321,
          user: "carol@example.com",
          hubDomain: "carol-portal",
        },
      },
    ]);

    const result = await hubspotOAuth.handleCallback("c", "s", null);

    // 3 calls: token exchange + primary (failed) + fallback.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const [meUrl, meInit] = fetchSpy.mock.calls[2]!;
    expect(meUrl).toBe("https://api.hubapi.com/integrations/v1/me");
    const meHeaders = meInit!.headers as Record<string, string>;
    expect(meHeaders.Authorization).toBe("Bearer tok");

    expect(result.account.providerAccountId).toBe("999111");
    expect(result.account.metadata.accountResolutionSource).toBe("fallback");
  });

  it("encrypts both access and refresh tokens; decrypt round-trips", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "ha_real_access_xyz",
          refresh_token: "hr_real_refresh_xyz",
          expires_in: 21600,
          scope: "oauth",
        },
      },
      {
        ok: true,
        json: { user: "u", user_id: 1, hub_id: 999, hub_domain: "d" },
      },
    ]);

    const result = await hubspotOAuth.handleCallback("c", "s", null);

    expect(result.tokens.accessTokenEncrypted).not.toContain(
      "ha_real_access_xyz",
    );
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(
      "ha_real_access_xyz",
    );
    expect(result.tokens.refreshTokenEncrypted).not.toBeNull();
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe(
      "hr_real_refresh_xyz",
    );
  });

  it("populates accessTokenExpiresAt from expires_in (HubSpot's 6h default)", async () => {
    const before = Math.floor(Date.now() / 1000);
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 21600,
          scope: "oauth",
        },
      },
      { ok: true, json: { hub_id: 123 } },
    ]);
    const result = await hubspotOAuth.handleCallback("c", "s", null);
    const after = Math.floor(Date.now() / 1000);
    expect(result.tokens.accessTokenExpiresAt).toBeGreaterThanOrEqual(
      before + 21600,
    );
    expect(result.tokens.accessTokenExpiresAt).toBeLessThanOrEqual(
      after + 21600,
    );
  });

  it("sets accessTokenExpiresAt to null when expires_in is absent (defensive)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          scope: "oauth",
        },
      },
      { ok: true, json: { hub_id: 123 } },
    ]);
    const result = await hubspotOAuth.handleCallback("c", "s", null);
    expect(result.tokens.accessTokenExpiresAt).toBeNull();
  });

  it("splits scope on space (HubSpot wire-format) into a scopes array", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 21600,
          scope: "crm.objects.contacts.read crm.objects.contacts.write oauth",
        },
      },
      { ok: true, json: { hub_id: 123 } },
    ]);
    const result = await hubspotOAuth.handleCallback("c", "s", null);
    expect(result.tokens.scopes).toEqual([
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "oauth",
    ]);
  });

  it("populates account info from hub_id + hub_domain + user", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 21600,
          scope: "oauth",
        },
      },
      {
        ok: true,
        json: {
          user: "dave@example.com",
          user_id: 8888,
          hub_id: 7700001,
          hub_domain: "dave-portal.hubspot.com",
        },
      },
    ]);
    const result = await hubspotOAuth.handleCallback("c", "s", null);
    expect(result.account.providerAccountId).toBe("7700001");
    // displayName preference: hub_domain > user > hub_id.
    expect(result.account.displayName).toBe("dave-portal.hubspot.com");
    expect(result.account.metadata).toEqual({
      hubId: "7700001",
      hubDomain: "dave-portal.hubspot.com",
      user: "dave@example.com",
      userId: "8888",
      accountResolutionSource: "primary",
      scopesGranted: ["oauth"],
    });
  });

  it("falls back displayName to user when hub_domain is missing", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 21600,
          scope: "oauth",
        },
      },
      {
        ok: true,
        json: { user: "ed@example.com", hub_id: 1, /* hub_domain missing */ },
      },
    ]);
    const result = await hubspotOAuth.handleCallback("c", "s", null);
    expect(result.account.displayName).toBe("ed@example.com");
  });

  it("falls back displayName to hubId when both hub_domain AND user are missing", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          expires_in: 21600,
          scope: "oauth",
        },
      },
      { ok: true, json: { hub_id: 9999 } },
    ]);
    const result = await hubspotOAuth.handleCallback("c", "s", null);
    expect(result.account.displayName).toBe("9999");
  });

  it("throws when HubSpot returns 4xx on token exchange", async () => {
    mockFetchSequence([
      { ok: false, status: 400, json: { message: "invalid_grant" } },
    ]);
    await expect(
      hubspotOAuth.handleCallback("c", "s", null),
    ).rejects.toThrow(/invalid_grant/);
  });

  it("throws when access_token is missing from token response (defensive)", async () => {
    mockFetchSequence([
      { ok: true, json: { refresh_token: "y", scope: "oauth" } },
    ]);
    await expect(
      hubspotOAuth.handleCallback("c", "s", null),
    ).rejects.toThrow(/access_token/);
  });

  it("throws when refresh_token is missing from token response (HubSpot always issues one)", async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: "x", expires_in: 21600 } },
    ]);
    await expect(
      hubspotOAuth.handleCallback("c", "s", null),
    ).rejects.toThrow(/refresh_token/);
  });

  it("throws when HUBSPOT_CLIENT_SECRET is unset", async () => {
    delete process.env.HUBSPOT_CLIENT_SECRET;
    await expect(
      hubspotOAuth.handleCallback("c", "s", null),
    ).rejects.toThrow(/HUBSPOT_CLIENT_SECRET/);
  });
});

// ─── refreshToken ───────────────────────────────────────────────────────────

describe("hubspotOAuth.refreshToken", () => {
  it("posts BODY-AUTH form-encoded body to /oauth/v1/token with grant_type=refresh_token", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 21600,
          scope: "oauth",
        },
      },
    ]);

    await hubspotOAuth.refreshToken("old-refresh-token");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.hubapi.com/oauth/v1/token");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const params = new URLSearchParams(init!.body as string);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("old-refresh-token");
    expect(params.get("client_id")).toBe("test-hubspot-client-id");
    expect(params.get("client_secret")).toBe("test-hubspot-client-secret");
    // Per V1's sendRedirectUriWithRefresh: true.
    expect(params.get("redirect_uri")).toBe(EXPECTED_REDIRECT);
  });

  it("PRESERVES the original refresh_token when the response omits it (HubSpot's stable-refresh contract)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "new-access",
          // No refresh_token in response — HubSpot's stable-refresh case.
          expires_in: 21600,
          scope: "oauth",
        },
      },
    ]);

    const result = await hubspotOAuth.refreshToken("original-refresh-xyz");

    // Original refresh token survives — distinguishes HubSpot from
    // Airtable (mandatory rotation; throws on missing refresh_token).
    expect(result.refreshTokenEncrypted).not.toBeNull();
    expect(decryptToken(result.refreshTokenEncrypted!)).toBe(
      "original-refresh-xyz",
    );
  });

  it("PERSISTS the new refresh_token when the response includes one (defensive rotation)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "new-access",
          refresh_token: "rotated-refresh-abc",
          expires_in: 21600,
          scope: "oauth",
        },
      },
    ]);

    const result = await hubspotOAuth.refreshToken("original-refresh-xyz");

    expect(result.refreshTokenEncrypted).not.toBeNull();
    expect(decryptToken(result.refreshTokenEncrypted!)).toBe(
      "rotated-refresh-abc",
    );
  });

  it("encrypts the new access token; decrypt round-trips", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "fresh-access-xyz",
          expires_in: 21600,
          scope: "oauth",
        },
      },
    ]);

    const result = await hubspotOAuth.refreshToken("orig");

    expect(result.accessTokenEncrypted).not.toContain("fresh-access-xyz");
    expect(decryptToken(result.accessTokenEncrypted)).toBe("fresh-access-xyz");
  });

  it("throws when HubSpot returns 4xx on refresh", async () => {
    mockFetchSequence([
      { ok: false, status: 400, json: { message: "invalid_grant" } },
    ]);
    await expect(hubspotOAuth.refreshToken("orig")).rejects.toThrow(
      /invalid_grant/,
    );
  });

  it("throws when access_token is missing from refresh response (defensive)", async () => {
    mockFetchSequence([
      { ok: true, json: { expires_in: 21600, scope: "oauth" } },
    ]);
    await expect(hubspotOAuth.refreshToken("orig")).rejects.toThrow(
      /access_token/,
    );
  });

  it("uses HUBSPOT_TOKEN_BASE override when set (e2e mock surface)", async () => {
    process.env.HUBSPOT_TOKEN_BASE = "http://localhost:9883";
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          expires_in: 21600,
          scope: "oauth",
        },
      },
    ]);
    await hubspotOAuth.refreshToken("orig");
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://localhost:9883/oauth/v1/token",
    );
  });
});

// ─── revoke (stub) ──────────────────────────────────────────────────────────

describe("hubspotOAuth.revoke", () => {
  it("is a stub that resolves without making any HTTP calls (deferred to disconnect-UX slice)", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    await expect(hubspotOAuth.revoke("any-token")).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
