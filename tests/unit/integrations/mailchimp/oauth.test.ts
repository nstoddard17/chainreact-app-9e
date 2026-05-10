/**
 * @jest-environment node
 *
 * Tests for mailchimpOAuth — V2's body-auth + non-refreshable +
 * no-PKCE OAuth provider with the new per-datacenter API host
 * routing model. Mocks the global fetch so we don't hit Mailchimp.
 *
 * Verifies:
 *   - No PKCE — `generatePkce` is undefined; authorize URL has no
 *     code_challenge params.
 *   - No `validateProviderHint` — Mailchimp dc resolves post-callback,
 *     not from user input.
 *   - Authorize URL omits `scope=` parameter entirely (Mailchimp
 *     doesn't enforce scopes; the manifest's synthetic
 *     "account_access" is documentation-only).
 *   - Token exchange wire-format: BODY-AUTH (client_secret in form
 *     body), application/x-www-form-urlencoded.
 *   - Auxiliary metadata + /3.0/ root GETs use the right auth header
 *     shapes (OAuth-prefix for metadata, Bearer for /3.0/).
 *   - dc captured into account.metadata.dc.
 *   - accountId (account_id from /3.0/) becomes providerAccountId.
 *   - Encrypted access token storage; no refresh token; null expiry.
 *   - Synthetic scopes recorded (["account_access"]).
 *   - Non-refreshable contract: refreshToken throws
 *     `RefreshNotSupportedError("mailchimp")`.
 *   - Env overrides (MAILCHIMP_LOGIN_BASE, MAILCHIMP_API_BASE_OVERRIDE)
 *     flow through to the right calls.
 *   - All failure modes throw with parseable messages.
 */
import { randomBytes } from "node:crypto";
import { RefreshNotSupportedError } from "@/contracts/integration";
import { decryptToken } from "@/core/encryption/tokens";
import { mailchimpOAuth } from "@/integrations/mailchimp/oauth";

const TOKEN_KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.MAILCHIMP_CLIENT_ID = "1234567890abcdef";
  process.env.MAILCHIMP_CLIENT_SECRET =
    "test_mailchimp_client_secret_xxxxxxxxxxxxxx";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MAILCHIMP_CLIENT_ID;
  delete process.env.MAILCHIMP_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.MAILCHIMP_LOGIN_BASE;
  delete process.env.MAILCHIMP_API_BASE_OVERRIDE;
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

// Mailchimp's manifest declares a synthetic ["account_access"] scope
// to satisfy the contract's "≥1 scope for OAuth providers" rule.
// The dispatcher passes the manifest scope through to buildAuthUrl,
// but Mailchimp's authorize URL omits the `scope=` param entirely
// (see oauth.ts buildAuthUrl).
const SCOPES = ["account_access"] as const;

const EXPECTED_REDIRECT =
  "https://app.example.test/api/integrations/oauth/mailchimp/callback";

// ─── generatePkce — absent ──────────────────────────────────────────────────

describe("mailchimpOAuth.generatePkce", () => {
  it("is undefined (Mailchimp's authorize endpoint does not accept PKCE)", () => {
    // The dispatcher detects this via `oauth.generatePkce?.()`
    // returning undefined and passes `null` to buildAuthUrl /
    // handleCallback.
    expect(mailchimpOAuth.generatePkce).toBeUndefined();
  });
});

// ─── validateProviderHint — absent ──────────────────────────────────────────

describe("mailchimpOAuth.validateProviderHint", () => {
  it("is undefined (Mailchimp dc resolves post-callback, not from user input)", () => {
    // Unlike Shopify (where the shop subdomain IS user input
    // captured at connect time), Mailchimp's dc is fetched from
    // /oauth2/metadata AFTER token exchange — the user never knows
    // / inputs their dc. No providerHint shape is needed.
    expect(mailchimpOAuth.validateProviderHint).toBeUndefined();
  });
});

// ─── buildAuthUrl ───────────────────────────────────────────────────────────

describe("mailchimpOAuth.buildAuthUrl", () => {
  it("produces a Mailchimp authorize URL with all required params", () => {
    const url = mailchimpOAuth.buildAuthUrl("STATE-TOKEN", SCOPES, null);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://login.mailchimp.com/oauth2/authorize",
    );
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("1234567890abcdef");
    expect(u.searchParams.get("state")).toBe("STATE-TOKEN");
    expect(u.searchParams.get("redirect_uri")).toBe(EXPECTED_REDIRECT);
  });

  it("does NOT include a 'scope' parameter (Mailchimp ignores it; honest model is no-scope)", () => {
    // Anti-test for the scope-enforcing providers (GitHub, Slack,
    // Google, Microsoft, etc.). Mailchimp's OAuth2 flow grants
    // account-wide access; the `scope` query parameter is
    // documented but not enforced. V2 omits it for honesty with
    // the actual access model — including a misleading scope=
    // value would document a permission boundary that doesn't
    // exist.
    const url = mailchimpOAuth.buildAuthUrl("S", SCOPES, null);
    expect(new URL(url).searchParams.get("scope")).toBeNull();
  });

  it("does NOT include PKCE params (Mailchimp does not accept code_challenge)", () => {
    const url = mailchimpOAuth.buildAuthUrl("S", SCOPES, null);
    const u = new URL(url);
    expect(u.searchParams.get("code_challenge")).toBeNull();
    expect(u.searchParams.get("code_challenge_method")).toBeNull();
  });

  it("ignores any pkce parameter passed (defensive — dispatcher should pass null)", () => {
    // If a future refactor mistakenly threads PKCE for Mailchimp,
    // the URL must still be Mailchimp-correct (no PKCE leakage).
    const url = mailchimpOAuth.buildAuthUrl("S", SCOPES, {
      codeChallenge: "should-not-appear",
      codeChallengeMethod: "S256",
    });
    expect(url).not.toContain("code_challenge");
    expect(url).not.toContain("should-not-appear");
  });

  it("throws when MAILCHIMP_CLIENT_ID is not set", () => {
    delete process.env.MAILCHIMP_CLIENT_ID;
    expect(() => mailchimpOAuth.buildAuthUrl("S", SCOPES, null)).toThrow(
      /MAILCHIMP_CLIENT_ID/,
    );
  });

  it("falls back to localhost redirect_uri when NEXT_PUBLIC_APP_URL is not set", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const url = mailchimpOAuth.buildAuthUrl("S", SCOPES, null);
    expect(new URL(url).searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/integrations/oauth/mailchimp/callback",
    );
  });

  it("uses MAILCHIMP_LOGIN_BASE override when set (e2e mock surface)", () => {
    process.env.MAILCHIMP_LOGIN_BASE = "http://localhost:9885";
    const url = mailchimpOAuth.buildAuthUrl("S", SCOPES, null);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "http://localhost:9885/oauth2/authorize",
    );
  });

  it("defaults to login.mailchimp.com when MAILCHIMP_LOGIN_BASE is unset (production-safe)", () => {
    delete process.env.MAILCHIMP_LOGIN_BASE;
    const url = mailchimpOAuth.buildAuthUrl("S", SCOPES, null);
    expect(new URL(url).origin).toBe("https://login.mailchimp.com");
  });
});

// ─── handleCallback ─────────────────────────────────────────────────────────

describe("mailchimpOAuth.handleCallback", () => {
  it("posts BODY-AUTH form-encoded body to /oauth2/token (no Authorization header)", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "mc_access_xyz",
          expires_in: 0,
          scope: null,
          token_type: "bearer",
        },
      },
      // metadata endpoint
      {
        ok: true,
        json: {
          dc: "us21",
          accountname: "Acme Corp",
          login: { email: "owner@acme.com" },
        },
      },
      // /3.0/ root
      {
        ok: true,
        json: {
          account_id: "8d3a3db4d97663a9074efcc16",
          account_name: "Acme Corp",
        },
      },
    ]);

    await mailchimpOAuth.handleCallback("auth-code-1", "state", null);

    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0]!;
    expect(tokenUrl).toBe("https://login.mailchimp.com/oauth2/token");
    expect(tokenInit!.method).toBe("POST");
    const headers = (tokenInit!.headers as Record<string, string>) ?? {};
    // Body-auth: NO Authorization header on the token exchange.
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const params = new URLSearchParams(tokenInit!.body as string);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("auth-code-1");
    expect(params.get("client_id")).toBe("1234567890abcdef");
    // client_secret IS in the body for Mailchimp (body-auth).
    expect(params.get("client_secret")).toBe(
      "test_mailchimp_client_secret_xxxxxxxxxxxxxx",
    );
    expect(params.get("redirect_uri")).toBe(EXPECTED_REDIRECT);
  });

  it("fetches /oauth2/metadata with OAuth-prefix auth (NOT Bearer)", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: { access_token: "mc_x", token_type: "bearer" },
      },
      { ok: true, json: { dc: "us21" } },
      { ok: true, json: { account_id: "a" } },
    ]);
    await mailchimpOAuth.handleCallback("c", "s", null);

    const [metadataUrl, metadataInit] = fetchSpy.mock.calls[1]!;
    expect(metadataUrl).toBe("https://login.mailchimp.com/oauth2/metadata");
    const headers = (metadataInit!.headers as Record<string, string>) ?? {};
    // Mailchimp's legacy header convention for this single endpoint.
    expect(headers.Authorization).toBe("OAuth mc_x");
  });

  it("fetches /3.0/ root with Bearer auth on the per-dc origin", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: { access_token: "mc_x", token_type: "bearer" },
      },
      { ok: true, json: { dc: "us21" } },
      { ok: true, json: { account_id: "a" } },
    ]);
    await mailchimpOAuth.handleCallback("c", "s", null);

    const [apiUrl, apiInit] = fetchSpy.mock.calls[2]!;
    // The per-dc origin (proves dc-routing wired correctly).
    expect(apiUrl).toBe("https://us21.api.mailchimp.com/3.0/");
    const headers = (apiInit!.headers as Record<string, string>) ?? {};
    // Bearer here — the standard Mailchimp REST API scheme.
    expect(headers.Authorization).toBe("Bearer mc_x");
  });

  it("encrypts the access token (no refresh token); decrypt round-trips", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "mc_real_access_xyz",
          token_type: "bearer",
        },
      },
      { ok: true, json: { dc: "us21" } },
      { ok: true, json: { account_id: "a" } },
    ]);

    const result = await mailchimpOAuth.handleCallback("c", "s", null);

    expect(result.tokens.accessTokenEncrypted).not.toContain(
      "mc_real_access_xyz",
    );
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(
      "mc_real_access_xyz",
    );
    // Non-refreshable — no refresh token persisted.
    expect(result.tokens.refreshTokenEncrypted).toBeNull();
    // No expiry — Mailchimp tokens don't expire (the response's
    // `expires_in: 0` is sentinel; V2 normalizes to null).
    expect(result.tokens.accessTokenExpiresAt).toBeNull();
  });

  it("records synthetic ['account_access'] scope (matches manifest)", async () => {
    // Mailchimp's token-exchange response carries `scope: null`.
    // V2 normalizes to the manifest's synthetic ["account_access"]
    // so the audit row matches what the consent UI displayed.
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "mc_x",
          token_type: "bearer",
          scope: null,
        },
      },
      { ok: true, json: { dc: "us21" } },
      { ok: true, json: { account_id: "a" } },
    ]);
    const result = await mailchimpOAuth.handleCallback("c", "s", null);
    expect(result.tokens.scopes).toEqual(["account_access"]);
  });

  it("uses /3.0/ account_id as providerAccountId (stable identity across reconnects)", async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: "x", token_type: "bearer" } },
      { ok: true, json: { dc: "us21" } },
      {
        ok: true,
        json: {
          account_id: "8d3a3db4d97663a9074efcc16",
          account_name: "Acme Corp",
        },
      },
    ]);
    const result = await mailchimpOAuth.handleCallback("c", "s", null);
    expect(result.account.providerAccountId).toBe(
      "8d3a3db4d97663a9074efcc16",
    );
  });

  it("populates account.metadata with dc + mailchimpAccountId + scopesGranted", async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: "x", token_type: "bearer" } },
      {
        ok: true,
        json: {
          dc: "us21",
          accountname: "Acme Corp",
          api_endpoint: "https://us21.api.mailchimp.com",
          login_url: "https://login.mailchimp.com",
          login: { email: "owner@acme.com" },
        },
      },
      {
        ok: true,
        json: {
          account_id: "8d3a3db4d97663a9074efcc16",
          account_name: "Acme Corp (Production)",
        },
      },
    ]);
    const result = await mailchimpOAuth.handleCallback("c", "s", null);
    expect(result.account.metadata).toEqual({
      // dc is THE critical field — every subsequent API call needs it.
      dc: "us21",
      mailchimpAccountId: "8d3a3db4d97663a9074efcc16",
      accountName: "Acme Corp (Production)",
      email: "owner@acme.com",
      apiEndpoint: "https://us21.api.mailchimp.com",
      loginUrl: "https://login.mailchimp.com",
      scopesGranted: ["account_access"],
    });
  });

  it("uses accountName as displayName when present, else email, else accountId", async () => {
    // Priority: accountName → email → accountId. V1 stores
    // account_name for display; V2 mirrors with the email fallback
    // (matches Slack / Stripe / Shopify pattern for missing-name
    // cases).

    // Case 1: accountName present.
    mockFetchSequence([
      { ok: true, json: { access_token: "x", token_type: "bearer" } },
      { ok: true, json: { dc: "us1", accountname: "From Meta" } },
      { ok: true, json: { account_id: "acc1", account_name: "From API" } },
    ]);
    const r1 = await mailchimpOAuth.handleCallback("c", "s", null);
    expect(r1.account.displayName).toBe("From API");

    // Case 2: accountName absent, email present.
    mockFetchSequence([
      { ok: true, json: { access_token: "x", token_type: "bearer" } },
      {
        ok: true,
        json: { dc: "us1", login: { email: "owner@example.com" } },
      },
      { ok: true, json: { account_id: "acc1" } },
    ]);
    const r2 = await mailchimpOAuth.handleCallback("c", "s", null);
    expect(r2.account.displayName).toBe("owner@example.com");

    // Case 3: both absent — falls back to accountId.
    mockFetchSequence([
      { ok: true, json: { access_token: "x", token_type: "bearer" } },
      { ok: true, json: { dc: "us1" } },
      { ok: true, json: { account_id: "acc-fallback" } },
    ]);
    const r3 = await mailchimpOAuth.handleCallback("c", "s", null);
    expect(r3.account.displayName).toBe("acc-fallback");
  });

  it("throws on token-exchange HTTP failure with parsed error_description", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: {
          error: "invalid_grant",
          error_description: "The authorization code is invalid or expired.",
        },
      },
    ]);
    await expect(mailchimpOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /Mailchimp token exchange failed: The authorization code is invalid or expired\./,
    );
  });

  it("falls back to error code when error_description is absent", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: { error: "invalid_client" },
      },
    ]);
    await expect(mailchimpOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /Mailchimp token exchange failed: invalid_client/,
    );
  });

  it("falls back to HTTP <status> when error response is not JSON", async () => {
    mockFetchSequence([{ ok: false, status: 502, text: "Bad Gateway" }]);
    await expect(mailchimpOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /Mailchimp token exchange failed: HTTP 502/,
    );
  });

  it("throws when MAILCHIMP_CLIENT_SECRET is missing", async () => {
    delete process.env.MAILCHIMP_CLIENT_SECRET;
    await expect(mailchimpOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /MAILCHIMP_CLIENT_SECRET/,
    );
  });

  it("throws when token response is missing access_token", async () => {
    mockFetchSequence([{ ok: true, json: { token_type: "bearer" } }]);
    await expect(mailchimpOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /missing access_token/,
    );
  });

  it("throws when token_type is not 'bearer' (response shape changed)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: { access_token: "x", token_type: "MAC" },
      },
    ]);
    await expect(mailchimpOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /Unexpected Mailchimp token_type: MAC/,
    );
  });

  it("propagates metadata-lookup failure (dc resolution required)", async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: "x", token_type: "bearer" } },
      { ok: false, status: 401 },
    ]);
    await expect(mailchimpOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /metadata lookup failed: HTTP 401/,
    );
  });

  it("propagates missing-dc failure", async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: "x", token_type: "bearer" } },
      { ok: true, json: { accountname: "no dc here" } },
    ]);
    await expect(mailchimpOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /missing 'dc'/,
    );
  });

  it("propagates missing-account_id failure (stable identity required)", async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: "x", token_type: "bearer" } },
      { ok: true, json: { dc: "us21" } },
      { ok: true, json: { account_name: "Acme but no account_id" } },
    ]);
    await expect(mailchimpOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /missing 'account_id'/,
    );
  });

  it("routes token exchange through MAILCHIMP_LOGIN_BASE override (e2e mock surface)", async () => {
    process.env.MAILCHIMP_LOGIN_BASE = "http://localhost:9885";
    const fetchSpy = mockFetchSequence([
      { ok: true, json: { access_token: "x", token_type: "bearer" } },
      { ok: true, json: { dc: "us21" } },
      { ok: true, json: { account_id: "a" } },
    ]);
    await mailchimpOAuth.handleCallback("c", "s", null);
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://localhost:9885/oauth2/token",
    );
    expect(fetchSpy.mock.calls[1]![0]).toBe(
      "http://localhost:9885/oauth2/metadata",
    );
  });

  it("routes /3.0/ root through MAILCHIMP_API_BASE_OVERRIDE (e2e single-port mock)", async () => {
    process.env.MAILCHIMP_API_BASE_OVERRIDE = "http://localhost:9885";
    const fetchSpy = mockFetchSequence([
      { ok: true, json: { access_token: "x", token_type: "bearer" } },
      { ok: true, json: { dc: "us21" } },
      { ok: true, json: { account_id: "a" } },
    ]);
    await mailchimpOAuth.handleCallback("c", "s", null);
    // Token + metadata go to the real login.mailchimp.com (no
    // MAILCHIMP_LOGIN_BASE override). The /3.0/ root call uses the
    // override.
    expect(fetchSpy.mock.calls[2]![0]).toBe("http://localhost:9885/3.0/");
  });
});

// ─── refreshToken (non-refreshable contract) ────────────────────────────────

describe("mailchimpOAuth.refreshToken — non-refreshable contract", () => {
  it("throws RefreshNotSupportedError('mailchimp') (matches Slack / Notion / Shopify / GitHub)", async () => {
    // V1's `authSchemes.ts:64` declares `'oauth_with_refresh'` but
    // V1's `provider-registry.ts:662` hardcodes `refresh_token:
    // null` — refresh is never attempted. V2 corrects with
    // `refreshable: false` + this typed throw. refreshAndRetry
    // catches and translates to IntegrationActionRequiredError.
    await expect(mailchimpOAuth.refreshToken("any")).rejects.toBeInstanceOf(
      RefreshNotSupportedError,
    );
    await expect(mailchimpOAuth.refreshToken("any")).rejects.toThrow(
      /Provider 'mailchimp' does not support token refresh/,
    );
  });

  it("does NOT make any fetch calls (non-refreshable means no network)", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    await expect(mailchimpOAuth.refreshToken("any")).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ─── revoke ─────────────────────────────────────────────────────────────────

describe("mailchimpOAuth.revoke", () => {
  it("is a no-op stub (matches every other V2 provider's deferred-disconnect-UX pattern)", async () => {
    await expect(mailchimpOAuth.revoke("any-token")).resolves.toBeUndefined();
  });

  it("does NOT make any fetch calls (stub — no-op)", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    await mailchimpOAuth.revoke("any");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
