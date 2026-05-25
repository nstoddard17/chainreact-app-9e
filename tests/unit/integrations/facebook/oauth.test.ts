/**
 * @jest-environment node
 *
 * Tests for facebookOAuth — Slice 3.FACEBOOK-2. Authorize URL, callback
 * (short→long-lived exchange + /me + granted permissions), and the
 * non-refreshable contract. Uses real encrypt/decrypt with a fixed key.
 */
import { RefreshNotSupportedError } from "@/contracts/integration";
import { decryptToken } from "@/core/encryption/tokens";
import { facebookOAuth } from "@/integrations/facebook/oauth";
import { GRAPH_API_VERSION } from "@/integrations/_shared/facebook/version";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 11) % 256;
  return bytes.toString("base64");
})();

beforeEach(() => {
  process.env.FACEBOOK_CLIENT_ID = "test-fb-client-id";
  process.env.FACEBOOK_CLIENT_SECRET = "test-fb-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.FACEBOOK_CLIENT_ID;
  delete process.env.FACEBOOK_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.FACEBOOK_AUTHORIZE_BASE;
  delete process.env.FACEBOOK_GRAPH_BASE;
});

function mockFetchSequence(
  responses: Array<{ ok: boolean; status?: number; json: unknown }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    const status = r.status ?? (r.ok ? 200 : 500);
    spy.mockResolvedValueOnce(new Response(JSON.stringify(r.json), { status }));
  }
  return spy;
}

const SCOPES = ["pages_show_list", "pages_manage_posts"] as const;

describe("facebookOAuth.buildAuthUrl", () => {
  it("targets the version-pinned dialog with a comma-joined scope + no PKCE", () => {
    const url = facebookOAuth.buildAuthUrl("state-xyz", SCOPES, null);
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://www.facebook.com");
    expect(parsed.pathname).toBe(`/${GRAPH_API_VERSION}/dialog/oauth`);
    expect(parsed.searchParams.get("client_id")).toBe("test-fb-client-id");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("scope")).toBe("pages_show_list,pages_manage_posts");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/facebook/callback",
    );
    expect(parsed.searchParams.get("state")).toBe("state-xyz");
    expect(parsed.searchParams.has("code_challenge")).toBe(false);
  });

  it("does NOT generate PKCE", () => {
    expect(facebookOAuth.generatePkce).toBeUndefined();
  });
});

describe("facebookOAuth.handleCallback", () => {
  it("exchanges code→short→long, persists the LONG token + null refresh token", async () => {
    const spy = mockFetchSequence([
      { ok: true, json: { access_token: "AT-short", token_type: "bearer", expires_in: 3600 } },
      { ok: true, json: { access_token: "AT-long", token_type: "bearer", expires_in: 5184000 } },
      { ok: true, json: { id: "fbuser-1", name: "Alice", email: "alice@example.com" } },
      {
        ok: true,
        json: {
          data: [
            { permission: "pages_show_list", status: "granted" },
            { permission: "pages_manage_posts", status: "granted" },
            { permission: "pages_messaging", status: "declined" },
          ],
        },
      },
    ]);
    const result = await facebookOAuth.handleCallback("code-1", "state-1", null);

    // Second call is the fb_exchange_token long-lived exchange.
    expect(String(spy.mock.calls[1]![0])).toContain("grant_type=fb_exchange_token");
    expect(String(spy.mock.calls[1]![0])).toContain("fb_exchange_token=AT-short");

    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe("AT-long");
    expect(result.tokens.refreshTokenEncrypted).toBeNull();
    expect(result.tokens.scopes).toEqual(["pages_show_list", "pages_manage_posts"]);
    expect(result.account.providerAccountId).toBe("fbuser-1");
    expect(result.account.displayName).toBe("Alice");
    expect(result.account.metadata!.facebookUserId).toBe("fbuser-1");
    expect(result.account.metadata!.email).toBe("alice@example.com");
  });

  it("throws a sanitized error on code-exchange failure", async () => {
    mockFetchSequence([
      { ok: false, status: 400, json: { error: { type: "OAuthException", code: 100, message: "bad code SECRET" } } },
    ]);
    let caught: unknown;
    try {
      await facebookOAuth.handleCallback("bad", "s", null);
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toMatch(/Facebook code exchange failed/);
    expect((caught as Error).message).not.toContain("SECRET");
  });

  it("tolerates a permissions-fetch failure (scopes empty, connect still succeeds)", async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: "AT-short", expires_in: 3600 } },
      { ok: true, json: { access_token: "AT-long", expires_in: 5184000 } },
      { ok: true, json: { id: "fbuser-2", name: "Bob" } },
      { ok: false, status: 500, json: { error: { type: "ServerError", code: 2 } } },
    ]);
    const result = await facebookOAuth.handleCallback("c", "s", null);
    expect(result.tokens.scopes).toEqual([]);
    expect(result.account.providerAccountId).toBe("fbuser-2");
  });
});

describe("facebookOAuth.refreshToken / revoke", () => {
  it("refreshToken throws RefreshNotSupportedError (no refresh token)", async () => {
    await expect(facebookOAuth.refreshToken("anything")).rejects.toBeInstanceOf(
      RefreshNotSupportedError,
    );
  });

  it("revoke is a stub (deferred to disconnect-UX slice)", async () => {
    await expect(facebookOAuth.revoke("any")).resolves.toBeUndefined();
  });
});
