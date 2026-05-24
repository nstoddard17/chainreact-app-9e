/**
 * @jest-environment node
 *
 * Tests for dropboxOAuth — Slice 3.DROPBOX-2. Exercises authorize URL
 * (token_access_type=offline, no PKCE), callback (account lookup +
 * refresh-token requirement), and refresh (preservation policy). Uses the
 * real encrypt/decrypt with a fixed key + a `fetch` sequence
 * (token exchange, then /2/users/get_current_account).
 */
import { decryptToken } from "@/core/encryption/tokens";
import { dropboxOAuth } from "@/integrations/dropbox/oauth";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 256;
  return bytes.toString("base64");
})();

beforeEach(() => {
  process.env.DROPBOX_CLIENT_ID = "test-dropbox-client-id";
  process.env.DROPBOX_CLIENT_SECRET = "test-dropbox-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.DROPBOX_CLIENT_ID;
  delete process.env.DROPBOX_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.DROPBOX_AUTHORIZE_BASE;
  delete process.env.DROPBOX_TOKEN_BASE;
  delete process.env.DROPBOX_API_BASE;
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

const SCOPES = [
  "account_info.read",
  "files.content.read",
  "files.content.write",
  "sharing.write",
] as const;

describe("dropboxOAuth.generatePkce", () => {
  it("does NOT generate PKCE (confidential client — D-DB2)", () => {
    expect(dropboxOAuth.generatePkce).toBeUndefined();
  });
});

describe("dropboxOAuth.buildAuthUrl", () => {
  it("targets Dropbox authorize with token_access_type=offline + response_type=code", () => {
    const url = dropboxOAuth.buildAuthUrl("state-xyz", SCOPES, null);
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://www.dropbox.com");
    expect(parsed.pathname).toBe("/oauth2/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("test-dropbox-client-id");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    // Load-bearing: without this Dropbox issues no refresh token.
    expect(parsed.searchParams.get("token_access_type")).toBe("offline");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/dropbox/callback",
    );
    expect(parsed.searchParams.get("scope")).toBe(
      "account_info.read files.content.read files.content.write sharing.write",
    );
    expect(parsed.searchParams.get("state")).toBe("state-xyz");
    expect(parsed.searchParams.has("code_challenge")).toBe(false);
  });

  it("honors DROPBOX_AUTHORIZE_BASE for e2e", () => {
    process.env.DROPBOX_AUTHORIZE_BASE = "https://mock.dropbox.local";
    const url = dropboxOAuth.buildAuthUrl("s", SCOPES, null);
    expect(url.startsWith("https://mock.dropbox.local/oauth2/authorize?")).toBe(
      true,
    );
  });
});

describe("dropboxOAuth.handleCallback", () => {
  it("resolves account_id as providerAccountId from get_current_account", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "AT-1",
          refresh_token: "RT-1",
          expires_in: 14400,
          scope: "account_info.read files.content.read",
          account_id: "dbid:from-token",
        },
      },
      {
        ok: true,
        json: {
          account_id: "dbid:abc123",
          name: { display_name: "Alice Example" },
          email: "alice@example.com",
        },
      },
    ]);
    const result = await dropboxOAuth.handleCallback("code-1", "state-1", null);
    expect(result.account.providerAccountId).toBe("dbid:abc123");
    expect(result.account.displayName).toBe("Alice Example");
    expect(result.account.metadata!.dropboxAccountId).toBe("dbid:abc123");
    expect(result.account.metadata!.email).toBe("alice@example.com");
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe("AT-1");
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe("RT-1");
    expect(result.tokens.scopes).toEqual([
      "account_info.read",
      "files.content.read",
    ]);
  });

  it("token exchange uses body-auth + sends token_access_type is on authorize only", async () => {
    const spy = mockFetchSequence([
      {
        ok: true,
        json: { access_token: "AT", refresh_token: "RT", expires_in: 14400 },
      },
      { ok: true, json: { account_id: "dbid:x", email: "a@b.com" } },
    ]);
    await dropboxOAuth.handleCallback("c1", "s1", null);
    const init = spy.mock.calls[0]![1]!;
    const body = String(init.body ?? "");
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("client_id=test-dropbox-client-id");
    expect(body).toContain("client_secret=test-dropbox-client-secret");
    expect(body).toContain("code=c1");
    expect(body).toContain("redirect_uri=");
    expect(init.headers as Record<string, string>).not.toHaveProperty(
      "Authorization",
    );
  });

  it("throws when the token response omits refresh_token (offline param dropped)", async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: "AT", expires_in: 14400 } },
    ]);
    await expect(
      dropboxOAuth.handleCallback("c", "s", null),
    ).rejects.toThrow(/missing refresh_token/);
  });

  it("throws a sanitized error on token-exchange failure", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: { error: "invalid_grant", error_description: "bad code" },
      },
    ]);
    await expect(
      dropboxOAuth.handleCallback("bad", "s", null),
    ).rejects.toThrow(/Dropbox token exchange failed: bad code/);
  });
});

describe("dropboxOAuth.refreshToken", () => {
  it("PRESERVES the original refresh token when the response omits one", async () => {
    mockFetchSequence([
      { ok: true, json: { access_token: "AT-new", expires_in: 14400 } },
    ]);
    const result = await dropboxOAuth.refreshToken("RT-old");
    expect(decryptToken(result.refreshTokenEncrypted!)).toBe("RT-old");
    expect(decryptToken(result.accessTokenEncrypted)).toBe("AT-new");
  });

  it("refresh body is grant_type=refresh_token + client auth (no redirect_uri needed)", async () => {
    const spy = mockFetchSequence([
      { ok: true, json: { access_token: "AT-new", expires_in: 14400 } },
    ]);
    await dropboxOAuth.refreshToken("RT-old");
    const body = String(spy.mock.calls[0]![1]!.body ?? "");
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=RT-old");
    expect(body).toContain("client_id=test-dropbox-client-id");
    expect(body).toContain("client_secret=test-dropbox-client-secret");
  });

  it("throws a sanitized error on refresh failure", async () => {
    mockFetchSequence([
      { ok: false, status: 401, json: { error: "invalid_grant" } },
    ]);
    await expect(dropboxOAuth.refreshToken("RT-bad")).rejects.toThrow(
      /Dropbox token refresh failed: invalid_grant/,
    );
  });
});

describe("dropboxOAuth.revoke", () => {
  it("is a stub (deferred to disconnect-UX slice)", async () => {
    await expect(dropboxOAuth.revoke("any")).resolves.toBeUndefined();
  });
});
