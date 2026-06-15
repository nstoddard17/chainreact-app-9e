/**
 * @jest-environment node
 *
 * Tests for mondayOAuth — Slice 3.MONDAY-2.
 *
 * Strategy mirrors hubspot/oauth.test.ts — the per-provider OAuth
 * module is the source of truth for Monday's wire format (no shared
 * helper). We exercise build, callback (success / { me } fallback /
 * GraphQL error), and refresh (preservation policy).
 */
import { decryptToken } from "@/core/encryption/tokens";
import { mondayOAuth } from "@/integrations/monday/oauth";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 13) % 256;
  return bytes.toString("base64");
})();

beforeEach(() => {
  process.env.MONDAY_CLIENT_ID = "test-monday-client-id";
  process.env.MONDAY_CLIENT_SECRET = "test-monday-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MONDAY_CLIENT_ID;
  delete process.env.MONDAY_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.MONDAY_AUTHORIZE_BASE;
  delete process.env.MONDAY_TOKEN_BASE;
  delete process.env.MONDAY_API_BASE;
});

function mockFetchSequence(
  responses: Array<{
    ok: boolean;
    status?: number;
    json: unknown;
    text?: string;
  }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    const status = r.status ?? (r.ok ? 200 : 500);
    if (r.text !== undefined) {
      spy.mockResolvedValueOnce(new Response(r.text, { status }));
    } else {
      spy.mockResolvedValueOnce(
        new Response(JSON.stringify(r.json), { status }),
      );
    }
  }
  return spy;
}

const SCOPES = [
  "me:read",
  "boards:read",
  "boards:write",
  "webhooks:write",
] as const;

describe("mondayOAuth.generatePkce", () => {
  it("does NOT generate PKCE (Monday's OAuth doesn't accept PKCE)", () => {
    // Per-provider contract: omitting generatePkce makes the dispatcher
    // pass null PKCE through every per-provider method.
    expect(mondayOAuth.generatePkce).toBeUndefined();
  });
});

describe("mondayOAuth.buildAuthUrl", () => {
  it("uses Monday's authorize endpoint with the configured redirect", () => {
    const url = mondayOAuth.buildAuthUrl("state-xyz", SCOPES, null);
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://auth.monday.com");
    expect(parsed.pathname).toBe("/oauth2/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("test-monday-client-id");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/monday/callback",
    );
    expect(parsed.searchParams.get("scope")).toBe(
      "me:read boards:read boards:write webhooks:write",
    );
    expect(parsed.searchParams.get("state")).toBe("state-xyz");
    // No PKCE params.
    expect(parsed.searchParams.has("code_challenge")).toBe(false);
    expect(parsed.searchParams.has("code_challenge_method")).toBe(false);
  });

  it("honors MONDAY_AUTHORIZE_BASE for e2e tests", () => {
    process.env.MONDAY_AUTHORIZE_BASE = "https://mock.monday.local";
    const url = mondayOAuth.buildAuthUrl("s", SCOPES, null);
    expect(url.startsWith("https://mock.monday.local/oauth2/authorize?")).toBe(
      true,
    );
  });
});

describe("mondayOAuth.handleCallback", () => {
  it("returns providerAccountId from { me } email when present", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "AT-1",
          refresh_token: "RT-1",
          expires_in: 86400,
          scope: "me:read boards:read",
        },
      },
      {
        ok: true,
        json: {
          data: {
            me: {
              id: "12345",
              name: "Alice Example",
              email: "alice@example.com",
            },
          },
        },
      },
    ]);
    const result = await mondayOAuth.handleCallback(
      "code-1",
      "state-1",
      null,
    );
    expect(result.account.providerAccountId).toBe("alice@example.com");
    expect(result.account.displayName).toBe("Alice Example");
    expect(result.account.metadata!.mondayUserId).toBe("12345");
    expect(result.account.metadata!.email).toBe("alice@example.com");
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe("AT-1");
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe("RT-1");
    expect(result.tokens.scopes).toEqual(["me:read", "boards:read"]);
  });

  it("falls back to numeric id as providerAccountId when email is null", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "AT-2",
          refresh_token: "RT-2",
          expires_in: 86400,
        },
      },
      {
        ok: true,
        json: {
          data: { me: { id: "67890", name: "Bob", email: null } },
        },
      },
    ]);
    const result = await mondayOAuth.handleCallback("code", "state", null);
    expect(result.account.providerAccountId).toBe("67890");
    expect(result.account.displayName).toBe("Bob");
    expect(result.account.metadata!.email).toBeNull();
  });

  it("throws when token endpoint returns non-2xx", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 400,
        json: { error: "invalid_grant", error_description: "Bad code" },
      },
    ]);
    await expect(
      mondayOAuth.handleCallback("bad", "state", null),
    ).rejects.toThrow(/Monday token exchange failed: Bad code/);
  });

  it("throws when token response is missing refresh_token", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: { access_token: "AT", expires_in: 86400 },
      },
    ]);
    await expect(
      mondayOAuth.handleCallback("c", "s", null),
    ).rejects.toThrow(/missing refresh_token/);
  });

  it("throws when { me } returns GraphQL errors", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "AT",
          refresh_token: "RT",
          expires_in: 86400,
        },
      },
      {
        ok: true,
        json: { errors: [{ message: "permission denied" }] },
      },
    ]);
    await expect(
      mondayOAuth.handleCallback("c", "s", null),
    ).rejects.toThrow(/permission denied/);
  });

  it("token exchange uses body-auth (client_id + client_secret in form body)", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "AT",
          refresh_token: "RT",
          expires_in: 86400,
        },
      },
      {
        ok: true,
        json: { data: { me: { id: "1", email: "a@b.com" } } },
      },
    ]);
    await mondayOAuth.handleCallback("c1", "s1", null);
    const init = fetchSpy.mock.calls[0]![1]!;
    const body = String(init.body ?? "");
    expect(body).toContain("client_id=test-monday-client-id");
    expect(body).toContain("client_secret=test-monday-client-secret");
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=c1");
    expect(body).toContain("redirect_uri=");
    // No Authorization header — body-auth.
    expect(init.headers as Record<string, string>).not.toHaveProperty(
      "Authorization",
    );
  });
});

describe("mondayOAuth.refreshToken", () => {
  it("persists new refresh_token when response includes one (rotation case)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "AT-new",
          refresh_token: "RT-new",
          expires_in: 86400,
          scope: "me:read",
        },
      },
    ]);
    const result = await mondayOAuth.refreshToken("RT-old");
    expect(decryptToken(result.refreshTokenEncrypted!)).toBe("RT-new");
    expect(decryptToken(result.accessTokenEncrypted)).toBe("AT-new");
    expect(result.scopes).toEqual(["me:read"]);
  });

  it("PRESERVES original refresh_token when response omits one (preservation policy)", async () => {
    mockFetchSequence([
      {
        ok: true,
        json: {
          access_token: "AT-new",
          expires_in: 86400,
        },
      },
    ]);
    const result = await mondayOAuth.refreshToken("RT-old");
    expect(decryptToken(result.refreshTokenEncrypted!)).toBe("RT-old");
    expect(decryptToken(result.accessTokenEncrypted)).toBe("AT-new");
  });

  it("throws when refresh endpoint returns non-2xx", async () => {
    mockFetchSequence([
      {
        ok: false,
        status: 401,
        json: { error: "invalid_grant" },
      },
    ]);
    // V2-READY-32 — invalid_grant → typed RefreshAuthRequiredError (reconnect).
    await expect(mondayOAuth.refreshToken("RT-bad")).rejects.toMatchObject({
      name: "RefreshAuthRequiredError",
      code: "invalid_grant",
    });
  });

  it("refresh body includes client auth + redirect_uri (V1's sendRedirectUriWithRefresh)", async () => {
    const fetchSpy = mockFetchSequence([
      {
        ok: true,
        json: { access_token: "AT-new", expires_in: 86400 },
      },
    ]);
    await mondayOAuth.refreshToken("RT-old");
    const init = fetchSpy.mock.calls[0]![1]!;
    const body = String(init.body ?? "");
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("client_id=test-monday-client-id");
    expect(body).toContain("client_secret=test-monday-client-secret");
    expect(body).toContain("redirect_uri=");
    expect(body).toContain("refresh_token=RT-old");
  });
});

describe("mondayOAuth.revoke", () => {
  it("is a stub (deferred to disconnect-UX slice)", async () => {
    await expect(mondayOAuth.revoke("any")).resolves.toBeUndefined();
  });
});
