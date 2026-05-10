/**
 * @jest-environment node
 *
 * Tests for githubOAuth — V2's body-auth + non-refreshable + no-PKCE
 * OAuth provider. Mocks the global fetch so we don't hit GitHub.
 * Verifies:
 *   - No PKCE — `generatePkce` is omitted; authorize URL has no
 *     `code_challenge` params.
 *   - Authorize URL wire-format: client_id, scope (space-separated),
 *     redirect_uri, state. No PKCE params.
 *   - Token exchange wire-format: BODY-AUTH (client_secret in form
 *     body, NOT in Authorization header), application/x-www-form-urlencoded,
 *     `Accept: application/json`.
 *   - GitHub's "200 OK with `{ error }` body" failure mode is
 *     detected (auth code expired etc).
 *   - Auxiliary `/user` GET uses `Authorization: token <token>`
 *     (GitHub's idiomatic header — NOT `Bearer`) and the API
 *     version header.
 *   - `login` extracted as providerAccountId; metadata captures id,
 *     avatar_url, scopesGranted.
 *   - Non-refreshable contract: `refreshToken` throws
 *     `RefreshNotSupportedError("github")`.
 *   - `accessTokenExpiresAt` is null and `refreshTokenEncrypted` is
 *     null (GitHub OAuth App tokens don't expire and have no
 *     refresh grant).
 *   - Env override base URLs (`GITHUB_AUTHORIZE_BASE`,
 *     `GITHUB_API_BASE`) flow through to the right calls.
 */
import { randomBytes } from "node:crypto";
import { RefreshNotSupportedError } from "@/contracts/integration";
import { decryptToken } from "@/core/encryption/tokens";
import { githubOAuth } from "@/integrations/github/oauth";

const TOKEN_KEY = randomBytes(32).toString("base64");

beforeEach(() => {
  process.env.GITHUB_CLIENT_ID = "Iv1.test_github_client_id";
  process.env.GITHUB_CLIENT_SECRET = "test_github_client_secret_xxxxxxxxxxxxxx";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.GITHUB_AUTHORIZE_BASE;
  delete process.env.GITHUB_API_BASE;
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

const SCOPES = ["repo", "read:org", "gist"] as const;

const EXPECTED_REDIRECT =
  "https://app.example.test/api/integrations/oauth/github/callback";

// ─── generatePkce — absent ──────────────────────────────────────────────────

describe("githubOAuth.generatePkce", () => {
  it("is undefined (GitHub OAuth Apps do not use PKCE)", () => {
    // Slice 14b plan §"OAuth model": GitHub's authorize endpoint
    // does not accept code_challenge / code_challenge_method
    // parameters. The dispatcher detects this via
    // `oauth.generatePkce?.()` returning undefined and passes `null`
    // to buildAuthUrl / handleCallback.
    expect(githubOAuth.generatePkce).toBeUndefined();
  });
});

// ─── buildAuthUrl ───────────────────────────────────────────────────────────

describe("githubOAuth.buildAuthUrl", () => {
  it("produces a GitHub authorize URL with all required params", () => {
    const url = githubOAuth.buildAuthUrl("STATE-TOKEN", SCOPES, null);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(u.searchParams.get("client_id")).toBe("Iv1.test_github_client_id");
    expect(u.searchParams.get("state")).toBe("STATE-TOKEN");
    expect(u.searchParams.get("redirect_uri")).toBe(EXPECTED_REDIRECT);
  });

  it("joins scopes with a space (GitHub OAuth Apps convention)", () => {
    // GitHub accepts both space-separated and `,`-separated scope
    // strings, but space is the canonical form per current docs.
    const url = githubOAuth.buildAuthUrl("S", SCOPES, null);
    expect(new URL(url).searchParams.get("scope")).toBe("repo read:org gist");
  });

  it("does NOT include PKCE params (GitHub does not accept code_challenge)", () => {
    // Anti-test for the PKCE-required providers (Airtable, Google,
    // Microsoft). GitHub's authorize URL has zero PKCE params.
    const url = githubOAuth.buildAuthUrl("S", SCOPES, null);
    const u = new URL(url);
    expect(u.searchParams.get("code_challenge")).toBeNull();
    expect(u.searchParams.get("code_challenge_method")).toBeNull();
  });

  it("ignores any pkce parameter passed (defensive — dispatcher should pass null)", () => {
    // The dispatcher detects no-generatePkce and passes null. If a
    // future refactor mistakenly threads PKCE for GitHub, the URL
    // must still be GitHub-correct (no PKCE leakage).
    const url = githubOAuth.buildAuthUrl("S", SCOPES, {
      codeChallenge: "should-not-appear",
      codeChallengeMethod: "S256",
    });
    expect(url).not.toContain("code_challenge");
    expect(url).not.toContain("should-not-appear");
  });

  it("throws when GITHUB_CLIENT_ID is not set", () => {
    delete process.env.GITHUB_CLIENT_ID;
    expect(() => githubOAuth.buildAuthUrl("S", SCOPES, null)).toThrow(
      /GITHUB_CLIENT_ID/,
    );
  });

  it("falls back to localhost redirect_uri when NEXT_PUBLIC_APP_URL is not set", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const url = githubOAuth.buildAuthUrl("S", SCOPES, null);
    expect(new URL(url).searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/integrations/oauth/github/callback",
    );
  });

  it("uses GITHUB_AUTHORIZE_BASE override when set (e2e mock surface)", () => {
    process.env.GITHUB_AUTHORIZE_BASE = "http://localhost:9884";
    const url = githubOAuth.buildAuthUrl("S", SCOPES, null);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "http://localhost:9884/login/oauth/authorize",
    );
  });

  it("defaults to github.com when GITHUB_AUTHORIZE_BASE is unset (production-safe)", () => {
    delete process.env.GITHUB_AUTHORIZE_BASE;
    const url = githubOAuth.buildAuthUrl("S", SCOPES, null);
    expect(new URL(url).origin).toBe("https://github.com");
  });
});

// ─── handleCallback ─────────────────────────────────────────────────────────

describe("githubOAuth.handleCallback", () => {
  it("posts BODY-AUTH form-encoded body to /login/oauth/access_token (no Authorization header)", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "gho_test_access_xyz",
          token_type: "bearer",
          scope: "repo,read:org,gist",
        },
      },
      {
        ok: true,
        json: {
          login: "octocat",
          id: 583231,
          name: "The Octocat",
          avatar_url: "https://avatars.githubusercontent.com/u/583231",
        },
      },
    ]);

    await githubOAuth.handleCallback("auth-code-1", "state", null);

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0]!;
    expect(tokenUrl).toBe("https://github.com/login/oauth/access_token");
    expect(tokenInit!.method).toBe("POST");
    const headers = tokenInit!.headers as Record<string, string>;
    // Body-auth: NO Authorization header.
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    // Accept: application/json — elicits JSON response (GitHub
    // defaults to form-encoded).
    expect(headers.Accept).toBe("application/json");

    const params = new URLSearchParams(tokenInit!.body as string);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("auth-code-1");
    expect(params.get("client_id")).toBe("Iv1.test_github_client_id");
    // client_secret IS in the body for GitHub (body-auth — same as
    // Stripe, Slack).
    expect(params.get("client_secret")).toBe(
      "test_github_client_secret_xxxxxxxxxxxxxx",
    );
    expect(params.get("redirect_uri")).toBe(EXPECTED_REDIRECT);
  });

  it("makes a follow-up /user GET with token-style Authorization header (NOT Bearer)", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "gho_x",
          token_type: "bearer",
          scope: "repo",
        },
      },
      {
        ok: true,
        json: {
          login: "octocat",
          id: 1,
        },
      },
    ]);

    await githubOAuth.handleCallback("c", "s", null);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [userUrl, userInit] = fetchSpy.mock.calls[1]!;
    expect(userUrl).toBe("https://api.github.com/user");
    const headers = userInit!.headers as Record<string, string>;
    // GitHub's idiomatic auth header is `token <token>`, NOT
    // `Bearer <token>`. V1 lifecycle used Bearer (inconsistent with
    // V1 actions); V2 standardizes to `token` everywhere.
    expect(headers.Authorization).toBe("token gho_x");
    expect(headers.Accept).toBe("application/vnd.github+json");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("encrypts the access token (no refresh token); decrypt round-trips", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "gho_real_access_xyz",
          token_type: "bearer",
          scope: "repo",
        },
      },
      {
        ok: true,
        json: { login: "octocat", id: 1 },
      },
    ]);

    const result = await githubOAuth.handleCallback("c", "s", null);

    expect(result.tokens.accessTokenEncrypted).not.toContain(
      "gho_real_access_xyz",
    );
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(
      "gho_real_access_xyz",
    );
    // Non-refreshable — no refresh token persisted.
    expect(result.tokens.refreshTokenEncrypted).toBeNull();
    // No expiry — GitHub OAuth App tokens don't expire.
    expect(result.tokens.accessTokenExpiresAt).toBeNull();
  });

  it("parses comma-separated scope string into an array (tolerates whitespace after commas)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          token_type: "bearer",
          scope: "repo, read:org, gist",
        },
      },
      { ok: true, json: { login: "u", id: 1 } },
    ]);
    const result = await githubOAuth.handleCallback("c", "s", null);
    expect(result.tokens.scopes).toEqual(["repo", "read:org", "gist"]);
  });

  it("populates account info from /user response (login + name + avatar + id)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          token_type: "bearer",
          scope: "repo",
        },
      },
      {
        ok: true,
        json: {
          login: "octocat",
          id: 583231,
          name: "The Octocat",
          avatar_url: "https://avatars.githubusercontent.com/u/583231",
        },
      },
    ]);
    const result = await githubOAuth.handleCallback("c", "s", null);
    expect(result.account.providerAccountId).toBe("octocat");
    expect(result.account.displayName).toBe("The Octocat");
    expect(result.account.metadata).toEqual({
      login: "octocat",
      githubUserId: 583231,
      avatarUrl: "https://avatars.githubusercontent.com/u/583231",
      scopesGranted: ["repo"],
    });
  });

  it("falls back to login as displayName when /user.name is null/empty", async () => {
    // V2 convention: when the provider doesn't surface a friendly
    // name, fall back to a stable id (matches Airtable / Notion /
    // Slack / Stripe / Shopify pattern).
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          token_type: "bearer",
          scope: "repo",
        },
      },
      { ok: true, json: { login: "octocat", id: 1, name: null } },
    ]);
    const result = await githubOAuth.handleCallback("c", "s", null);
    expect(result.account.displayName).toBe("octocat");
  });

  it("populates metadata.avatarUrl=null when /user.avatar_url is missing", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          token_type: "bearer",
          scope: "repo",
        },
      },
      { ok: true, json: { login: "u", id: 1 } },
    ]);
    const result = await githubOAuth.handleCallback("c", "s", null);
    expect(result.account.metadata.avatarUrl).toBeNull();
  });

  it("detects GitHub's 200-OK-with-error-body failure mode (expired auth code)", async () => {
    // GitHub returns 200 OK with `{ error, error_description }` in
    // the body when the authorization code is invalid (rather than
    // a non-2xx status). V2 detects this shape and throws explicitly.
    mockFetchSequence([
      {
        ok: true,
        json: {
          error: "bad_verification_code",
          error_description: "The code passed is incorrect or expired.",
        },
      },
    ]);
    await expect(
      githubOAuth.handleCallback("expired-code", "s", null),
    ).rejects.toThrow(/GitHub OAuth error: bad_verification_code/);
  });

  it("throws on token-exchange HTTP failure with parsed error code", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: {
          error: "incorrect_client_credentials",
        },
      },
    ]);
    await expect(githubOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /GitHub token exchange failed: incorrect_client_credentials/,
    );
  });

  it("falls back to HTTP <status> when error response is not JSON", async () => {
    mockFetchSequence([{ ok: false, status: 502, text: "Bad Gateway" }]);
    await expect(githubOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /GitHub token exchange failed: HTTP 502/,
    );
  });

  it("throws when GITHUB_CLIENT_SECRET is missing", async () => {
    delete process.env.GITHUB_CLIENT_SECRET;
    await expect(githubOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /GITHUB_CLIENT_SECRET/,
    );
  });

  it("throws when token response is missing access_token", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          token_type: "bearer",
          scope: "repo",
        },
      },
    ]);
    await expect(githubOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /missing access_token/,
    );
  });

  it("throws when token_type is not 'bearer' (response shape changed)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          token_type: "MAC",
          scope: "repo",
        },
      },
    ]);
    await expect(githubOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /Unexpected GitHub token_type: MAC/,
    );
  });

  it("throws when /user lookup returns non-200", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          token_type: "bearer",
          scope: "repo",
        },
      },
      { ok: false, status: 401, text: "Bad credentials" },
    ]);
    await expect(githubOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /\/user lookup failed: HTTP 401/,
    );
  });

  it("throws when /user response is missing login", async () => {
    // login is required for accountIdField resolution — missing it
    // means the response shape changed.
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          token_type: "bearer",
          scope: "repo",
        },
      },
      { ok: true, json: { id: 1 } },
    ]);
    await expect(githubOAuth.handleCallback("c", "s", null)).rejects.toThrow(
      /missing login/,
    );
  });

  it("uses GITHUB_AUTHORIZE_BASE override for token exchange (e2e mock surface)", async () => {
    process.env.GITHUB_AUTHORIZE_BASE = "http://localhost:9884";
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          token_type: "bearer",
          scope: "repo",
        },
      },
      { ok: true, json: { login: "u", id: 1 } },
    ]);
    await githubOAuth.handleCallback("c", "s", null);
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      "http://localhost:9884/login/oauth/access_token",
    );
  });

  it("uses GITHUB_API_BASE override for /user lookup (e2e mock surface)", async () => {
    process.env.GITHUB_API_BASE = "http://localhost:9884";
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "x",
          token_type: "bearer",
          scope: "repo",
        },
      },
      { ok: true, json: { login: "u", id: 1 } },
    ]);
    await githubOAuth.handleCallback("c", "s", null);
    expect(fetchSpy.mock.calls[1]![0]).toBe("http://localhost:9884/user");
  });
});

// ─── refreshToken (non-refreshable contract) ───────────────────────────────

describe("githubOAuth.refreshToken — non-refreshable contract", () => {
  it("throws RefreshNotSupportedError('github') (matches Slack / Notion / Shopify)", async () => {
    // GitHub OAuth App tokens have no refresh grant. V2's
    // refreshAndRetry catches this typed error and translates to
    // IntegrationActionRequiredError so the user sees a "reconnect
    // your GitHub account" prompt instead of a stale-token retry
    // loop.
    await expect(githubOAuth.refreshToken("any")).rejects.toBeInstanceOf(
      RefreshNotSupportedError,
    );
    await expect(githubOAuth.refreshToken("any")).rejects.toThrow(
      /Provider 'github' does not support token refresh/,
    );
  });

  it("does NOT make any fetch calls (non-refreshable means no network)", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    await expect(githubOAuth.refreshToken("any")).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ─── revoke ─────────────────────────────────────────────────────────────────

describe("githubOAuth.revoke", () => {
  it("is a no-op stub (matches every other V2 provider's deferred-disconnect-UX pattern)", async () => {
    // Deferred to the disconnect-UX slice — matches every other V2
    // provider. GitHub provides
    // DELETE /applications/{client_id}/token for revocation; the
    // disconnect UX slice will wire it up across all providers
    // simultaneously.
    await expect(githubOAuth.revoke("any-token")).resolves.toBeUndefined();
  });

  it("does NOT make any fetch calls (stub — no-op)", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    await githubOAuth.revoke("any");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
