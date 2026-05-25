/**
 * @jest-environment node
 *
 * Tests for stripeOAuth — V2's first body-auth refreshable OAuth
 * provider, and the first Stripe Connect (platform-vs-merchant)
 * provider. Mocks the global fetch so we don't hit Stripe. Verifies:
 *   - No PKCE — `generatePkce` is omitted; authorize URL has no
 *     `code_challenge` params.
 *   - Authorize URL wire-format: client_id, response_type=code,
 *     scope=read_write, redirect_uri, state.
 *   - Token exchange wire-format: BODY-AUTH (client_secret in form
 *     body, NOT in Authorization header), application/x-www-form-urlencoded.
 *   - `stripe_user_id` extracted as providerAccountId; metadata
 *     captures publishable key, livemode, scope.
 *   - Refresh-token NON-rotation invariant: when refresh response
 *     omits refresh_token, V2 PRESERVES the original; when present,
 *     V2 PERSISTS the new value. Distinguishes Stripe from Airtable
 *     (mandatory rotation) and Google/Microsoft (preserve-old).
 *   - accessTokenExpiresAt is null when expires_in is absent (Stripe
 *     Connect's documented default — long-lived access tokens).
 */
import { randomBytes } from "node:crypto";
import { stripeOAuth } from "@/integrations/stripe/oauth";
import { decryptToken } from "@/core/encryption/tokens";

const TOKEN_KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.STRIPE_CLIENT_ID = "ca_test_stripe_client_id";
  process.env.STRIPE_CLIENT_SECRET = "sk_test_stripe_client_secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.STRIPE_CLIENT_ID;
  delete process.env.STRIPE_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.STRIPE_AUTHORIZE_BASE;
  delete process.env.STRIPE_TOKEN_BASE;
});

function mockFetchSequence(
  responses: Array<{ ok: boolean; status?: number; json?: unknown; text?: string }>,
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

const SCOPES = ["read_write"] as const;

const EXPECTED_REDIRECT =
  "https://app.example.test/api/integrations/oauth/stripe/callback";

// ─── generatePkce — absent ──────────────────────────────────────────────────

describe("stripeOAuth.generatePkce", () => {
  it("is undefined (Stripe Connect does not use PKCE)", () => {
    // Slice 11 Q5: Stripe Connect's authorize endpoint does not accept
    // code_challenge / code_challenge_method parameters. The dispatcher
    // detects this via `oauth.generatePkce?.()` returning undefined and
    // passes `null` to buildAuthUrl / handleCallback.
    expect(stripeOAuth.generatePkce).toBeUndefined();
  });
});

// ─── buildAuthUrl ───────────────────────────────────────────────────────────

describe("stripeOAuth.buildAuthUrl", () => {
  it("produces a Stripe Connect authorize URL with all required params", () => {
    const url = stripeOAuth.buildAuthUrl("STATE-TOKEN", SCOPES, null);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://connect.stripe.com/oauth/authorize",
    );
    expect(u.searchParams.get("client_id")).toBe("ca_test_stripe_client_id");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("state")).toBe("STATE-TOKEN");
    expect(u.searchParams.get("redirect_uri")).toBe(EXPECTED_REDIRECT);
  });

  it("requests scope=read_write (Stripe Connect's binary scope model)", () => {
    const url = stripeOAuth.buildAuthUrl("S", SCOPES, null);
    expect(new URL(url).searchParams.get("scope")).toBe("read_write");
  });

  it("does NOT include PKCE params (Stripe Connect does not accept code_challenge)", () => {
    // Anti-test for the PKCE-required providers (Airtable, Google,
    // Microsoft). Stripe Connect's authorize URL has zero PKCE params.
    const url = stripeOAuth.buildAuthUrl("S", SCOPES, null);
    const u = new URL(url);
    expect(u.searchParams.get("code_challenge")).toBeNull();
    expect(u.searchParams.get("code_challenge_method")).toBeNull();
  });

  it("ignores any pkce parameter passed (defensive — dispatcher should pass null)", () => {
    // The dispatcher detects no-generatePkce and passes null. If a
    // future refactor mistakenly threads PKCE for Stripe, the URL
    // must still be Stripe-correct (no PKCE leakage).
    const url = stripeOAuth.buildAuthUrl("S", SCOPES, {
      codeChallenge: "should-not-appear",
      codeChallengeMethod: "S256",
    });
    expect(url).not.toContain("code_challenge");
    expect(url).not.toContain("should-not-appear");
  });

  it("throws when STRIPE_CLIENT_ID is not set", () => {
    delete process.env.STRIPE_CLIENT_ID;
    expect(() => stripeOAuth.buildAuthUrl("S", SCOPES, null)).toThrow(
      /STRIPE_CLIENT_ID/,
    );
  });

  it("falls back to localhost redirect_uri when NEXT_PUBLIC_APP_URL is not set", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const url = stripeOAuth.buildAuthUrl("S", SCOPES, null);
    expect(new URL(url).searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/integrations/oauth/stripe/callback",
    );
  });

  it("uses STRIPE_AUTHORIZE_BASE override when set (e2e mock surface)", () => {
    process.env.STRIPE_AUTHORIZE_BASE = "http://localhost:9881";
    const url = stripeOAuth.buildAuthUrl("S", SCOPES, null);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "http://localhost:9881/oauth/authorize",
    );
  });

  it("defaults to connect.stripe.com when STRIPE_AUTHORIZE_BASE is unset (production-safe)", () => {
    delete process.env.STRIPE_AUTHORIZE_BASE;
    const url = stripeOAuth.buildAuthUrl("S", SCOPES, null);
    expect(new URL(url).origin).toBe("https://connect.stripe.com");
  });
});

// ─── handleCallback ─────────────────────────────────────────────────────────

describe("stripeOAuth.handleCallback", () => {
  it("posts BODY-AUTH form-encoded body to /oauth/token (no Authorization header, client_secret in body)", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "sk_test_access_xyz",
          refresh_token: "rt_test_refresh_xyz",
          scope: "read_write",
          livemode: false,
          stripe_user_id: "acct_TestMerchant1",
          stripe_publishable_key: "pk_test_publishable_xyz",
          token_type: "bearer",
        },
      },
    ]);

    await stripeOAuth.handleCallback("auth-code-1", "state", null);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0]!;
    expect(tokenUrl).toBe("https://connect.stripe.com/oauth/token");
    expect(tokenInit!.method).toBe("POST");
    const headers = tokenInit!.headers as Record<string, string>;
    // Body-auth: NO Authorization header.
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const params = new URLSearchParams(tokenInit!.body as string);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("auth-code-1");
    // client_secret IS in the body for Stripe (the load-bearing
    // distinguishing wire-format feature).
    expect(params.get("client_secret")).toBe("sk_test_stripe_client_secret");
    // Stripe's token exchange does NOT require redirect_uri on the
    // body (only on authorize).
    expect(params.get("redirect_uri")).toBeNull();
  });

  it("does NOT make a follow-up account-info call (stripe_user_id is in the token response)", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          scope: "read_write",
          stripe_user_id: "acct_X",
        },
      },
    ]);

    await stripeOAuth.handleCallback("c", "s", null);

    // Unlike Airtable (which calls /v0/meta/whoami after token
    // exchange), Stripe Connect's authorization_code response
    // already carries stripe_user_id — V2 doesn't need a second
    // round trip.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("encrypts both access and refresh tokens; decrypt round-trips", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "sk_real_access_xyz",
          refresh_token: "rt_real_refresh_xyz",
          scope: "read_write",
          stripe_user_id: "acct_X",
        },
      },
    ]);

    const result = await stripeOAuth.handleCallback("c", "s", null);

    expect(result.tokens.accessTokenEncrypted).not.toContain(
      "sk_real_access_xyz",
    );
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(
      "sk_real_access_xyz",
    );
    expect(result.tokens.refreshTokenEncrypted).not.toBeNull();
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe(
      "rt_real_refresh_xyz",
    );
  });

  it("sets accessTokenExpiresAt to null when expires_in is absent (Stripe Connect default)", async () => {
    // Stripe Connect's authorization_code response does NOT include
    // expires_in per current docs — access tokens are long-lived. V2
    // records null in that case.
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          scope: "read_write",
          stripe_user_id: "acct_X",
        },
      },
    ]);
    const result = await stripeOAuth.handleCallback("c", "s", null);
    expect(result.tokens.accessTokenExpiresAt).toBeNull();
  });

  it("populates accessTokenExpiresAt from expires_in when present (defensive future-proofing)", async () => {
    // Defensive against future Stripe behavior changes — if Stripe
    // ever returns expires_in, V2 records it.
    const before = Math.floor(Date.now() / 1000);
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          scope: "read_write",
          stripe_user_id: "acct_X",
          expires_in: 3600,
        },
      },
    ]);
    const result = await stripeOAuth.handleCallback("c", "s", null);
    const after = Math.floor(Date.now() / 1000);
    expect(result.tokens.accessTokenExpiresAt).toBeGreaterThanOrEqual(
      before + 3600,
    );
    expect(result.tokens.accessTokenExpiresAt).toBeLessThanOrEqual(after + 3600);
  });

  it("wraps the single-string scope as a single-element scopes array", async () => {
    // Stripe Connect's `scope` field is a single value (`read_only` or
    // `read_write`), not space-separated. Single-element array.
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          scope: "read_write",
          stripe_user_id: "acct_X",
        },
      },
    ]);
    const result = await stripeOAuth.handleCallback("c", "s", null);
    expect(result.tokens.scopes).toEqual(["read_write"]);
  });

  it("populates account info from stripe_user_id + metadata fields", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          scope: "read_write",
          livemode: true,
          stripe_user_id: "acct_1AbCDeFg",
          stripe_publishable_key: "pk_live_publishable_xyz",
        },
      },
    ]);
    const result = await stripeOAuth.handleCallback("c", "s", null);
    expect(result.account.providerAccountId).toBe("acct_1AbCDeFg");
    // displayName falls back to stripe_user_id (V2 convention —
    // Airtable / Notion / Slack all fall back to a stable id when the
    // provider doesn't surface a friendly name).
    expect(result.account.displayName).toBe("acct_1AbCDeFg");
    expect(result.account.metadata).toEqual({
      stripeUserId: "acct_1AbCDeFg",
      stripePublishableKey: "pk_live_publishable_xyz",
      livemode: true,
      scope: "read_write",
    });
  });

  it("sets metadata.livemode/publishableKey/scope to null when fields are missing (defensive)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          stripe_user_id: "acct_X",
          // No livemode, no stripe_publishable_key, no scope.
        },
      },
    ]);
    const result = await stripeOAuth.handleCallback("c", "s", null);
    expect(result.account.metadata).toEqual({
      stripeUserId: "acct_X",
      stripePublishableKey: null,
      livemode: null,
      scope: null,
    });
  });

  it("throws on token-exchange HTTP failure with parsed error code", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: {
          error: "invalid_grant",
          error_description: "Authorization code has expired.",
        },
      },
    ]);
    await expect(
      stripeOAuth.handleCallback("bad-code", "s", null),
    ).rejects.toThrow(/Stripe token exchange failed: invalid_grant/);
  });

  it("falls back to HTTP <status> when error response is not JSON", async () => {
    mockFetchSequence([{ ok: false, status: 502, text: "Bad Gateway" }]);
    await expect(
      stripeOAuth.handleCallback("c", "s", null),
    ).rejects.toThrow(/Stripe token exchange failed: HTTP 502/);
  });

  it("throws when STRIPE_CLIENT_SECRET is missing", async () => {
    delete process.env.STRIPE_CLIENT_SECRET;
    await expect(
      stripeOAuth.handleCallback("c", "s", null),
    ).rejects.toThrow(/STRIPE_CLIENT_SECRET/);
  });

  it("throws when token response is missing access_token", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          refresh_token: "x",
          scope: "read_write",
          stripe_user_id: "acct_X",
        },
      },
    ]);
    await expect(stripeOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /missing access_token/,
    );
  });

  it("throws when token response is missing refresh_token", async () => {
    // Stripe Connect's authorization_code flow always issues a
    // refresh_token. Missing one means the response shape changed,
    // the platform's OAuth config is wrong, or this isn't the
    // authorization_code flow. Fail loud — silently dropping it
    // would break the refresh path.
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          scope: "read_write",
          stripe_user_id: "acct_X",
        },
      },
    ]);
    await expect(stripeOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /missing refresh_token/,
    );
  });

  it("throws when token response is missing stripe_user_id", async () => {
    // stripe_user_id is required for accountIdField resolution —
    // missing it means the response shape changed or this is a
    // non-Connect OAuth flow.
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          scope: "read_write",
        },
      },
    ]);
    await expect(stripeOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /missing stripe_user_id/,
    );
  });

  it("uses STRIPE_TOKEN_BASE override (e2e mock surface)", async () => {
    process.env.STRIPE_TOKEN_BASE = "http://localhost:9881";
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          refresh_token: "y",
          scope: "read_write",
          stripe_user_id: "acct_X",
        },
      },
    ]);
    await stripeOAuth.handleCallback("c", "s", null);
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://localhost:9881/oauth/token",
    );
  });
});

// ─── refreshToken (NON-rotation contract) ───────────────────────────────────

describe("stripeOAuth.refreshToken — non-rotation contract", () => {
  it("posts body-auth + form body with grant_type=refresh_token + refresh_token + client_secret", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "sk_rotated_access",
          refresh_token: "rt_rotated_refresh",
          scope: "read_write",
          livemode: false,
          stripe_user_id: "acct_X",
        },
      },
    ]);

    await stripeOAuth.refreshToken("rt_original_refresh");

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://connect.stripe.com/oauth/token");
    expect(init!.method).toBe("POST");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const params = new URLSearchParams(init!.body as string);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("rt_original_refresh");
    expect(params.get("client_secret")).toBe("sk_test_stripe_client_secret");
    // Stripe Connect's refresh endpoint does not require redirect_uri.
    expect(params.get("redirect_uri")).toBeNull();
  });

  it("PRESERVES the original refresh_token when the response OMITS one (Stripe non-rotation default)", async () => {
    // Load-bearing test for V2's stable-refresh-token contract.
    // Stripe Connect refresh tokens are NOT rotated by default —
    // the same value can be reused indefinitely. V2's per-provider
    // refreshToken() must re-encrypt the ORIGINAL plaintext when
    // the response omits a new refresh_token. Distinguishes Stripe
    // from Airtable (mandatory rotation; missing field throws).
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "sk_new_access_only",
          // No refresh_token in response — Stripe's default behavior.
          scope: "read_write",
          stripe_user_id: "acct_X",
        },
      },
    ]);

    const result = await stripeOAuth.refreshToken("rt_ORIGINAL_STABLE_TOKEN");

    expect(decryptToken(result.refreshTokenEncrypted!)).toBe(
      "rt_ORIGINAL_STABLE_TOKEN",
    );
    expect(decryptToken(result.accessTokenEncrypted)).toBe(
      "sk_new_access_only",
    );
  });

  it("PERSISTS the new refresh_token when the response INCLUDES one (defense-in-depth rotation)", async () => {
    // Stripe Connect MAY occasionally include a fresh refresh_token
    // in the response (defense-in-depth rotation). When present, V2
    // PERSISTS the new value — discarding the original.
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "sk_rotated_access",
          refresh_token: "rt_NEW_ROTATED_TOKEN",
          scope: "read_write",
          stripe_user_id: "acct_X",
        },
      },
    ]);

    const result = await stripeOAuth.refreshToken("rt_OLD_TOKEN");

    expect(decryptToken(result.refreshTokenEncrypted!)).toBe(
      "rt_NEW_ROTATED_TOKEN",
    );
    expect(decryptToken(result.refreshTokenEncrypted!)).not.toBe(
      "rt_OLD_TOKEN",
    );
  });

  it("encrypts the new access_token; decrypt round-trips", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "sk_real_rotated_access",
          scope: "read_write",
          stripe_user_id: "acct_X",
        },
      },
    ]);
    const result = await stripeOAuth.refreshToken("rt_any");
    expect(result.accessTokenEncrypted).not.toContain(
      "sk_real_rotated_access",
    );
    expect(decryptToken(result.accessTokenEncrypted)).toBe(
      "sk_real_rotated_access",
    );
  });

  it("sets accessTokenExpiresAt to null when expires_in is absent (Stripe Connect default)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          scope: "read_write",
          stripe_user_id: "acct_X",
        },
      },
    ]);
    const result = await stripeOAuth.refreshToken("any");
    expect(result.accessTokenExpiresAt).toBeNull();
  });

  it("populates accessTokenExpiresAt from expires_in when present", async () => {
    const before = Math.floor(Date.now() / 1000);
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          scope: "read_write",
          stripe_user_id: "acct_X",
          expires_in: 3600,
        },
      },
    ]);
    const result = await stripeOAuth.refreshToken("any");
    const after = Math.floor(Date.now() / 1000);
    expect(result.accessTokenExpiresAt).toBeGreaterThanOrEqual(before + 3600);
    expect(result.accessTokenExpiresAt).toBeLessThanOrEqual(after + 3600);
  });

  it("throws on refresh HTTP failure with parsed error code (invalid_grant → reconnect)", async () => {
    // V2's refreshAndRetry catches the thrown Error and translates
    // to IntegrationActionRequiredError(reason: "refresh_failed").
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: { error: "invalid_grant" },
      },
    ]);
    await expect(stripeOAuth.refreshToken("expired-token")).rejects.toThrow(
      /Stripe token refresh failed: invalid_grant/,
    );
  });

  it("falls back to HTTP <status> when refresh error response is not JSON", async () => {
    mockFetchSequence([{ ok: false, status: 503, text: "Service Unavailable" }]);
    await expect(stripeOAuth.refreshToken("any")).rejects.toThrow(
      /Stripe token refresh failed: HTTP 503/,
    );
  });

  it("throws when refresh response is missing access_token (response invariant)", async () => {
    mockFetchSequence([
      { ok: true, json: { refresh_token: "x", scope: "read_write" } },
    ]);
    await expect(stripeOAuth.refreshToken("any")).rejects.toThrow(
      /refresh response missing access_token/,
    );
  });

  it("throws when STRIPE_CLIENT_SECRET is missing on refresh", async () => {
    delete process.env.STRIPE_CLIENT_SECRET;
    await expect(stripeOAuth.refreshToken("any")).rejects.toThrow(
      /STRIPE_CLIENT_SECRET/,
    );
  });

  it("uses STRIPE_TOKEN_BASE override for refresh (e2e mock surface)", async () => {
    process.env.STRIPE_TOKEN_BASE = "http://localhost:9881";
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          scope: "read_write",
          stripe_user_id: "acct_X",
        },
      },
    ]);
    await stripeOAuth.refreshToken("any");
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://localhost:9881/oauth/token",
    );
  });
});

// ─── revoke ─────────────────────────────────────────────────────────────────

describe("stripeOAuth.revoke", () => {
  it("is a no-op stub (matches every other V2 provider's deferred-disconnect-UX pattern)", async () => {
    await expect(stripeOAuth.revoke("any-token")).resolves.toBeUndefined();
  });
});
