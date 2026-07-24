/**
 * @jest-environment node
 *
 * MOTIVE-1 — motiveOAuth: non-PKCE authorize URL, body-auth token exchange,
 * companyId-from-/v1/companies contract (NOT /v1/users/me — that GET needs
 * `users.read`, which the manage-only Drivers portal row doesn't grant; live
 * 403 2026-07-24), missing-refresh fail-fast, rotating refresh persistence,
 * invalid_grant → RefreshAuthRequiredError. No plaintext token or client
 * secret ever appears in persisted shapes or the browser URL.
 */
import { decryptToken } from "@/core/encryption/tokens";
import { RefreshAuthRequiredError } from "@/contracts/integration";
import { motiveOAuth } from "@/integrations/motive/oauth";
import { motiveManifest } from "@/integrations/motive/manifest";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 41) % 256;
  return bytes.toString("base64");
})();

beforeEach(() => {
  process.env.MOTIVE_CLIENT_ID = "test-motive-client-id";
  process.env.MOTIVE_CLIENT_SECRET = "test-motive-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.MOTIVE_CLIENT_ID;
  delete process.env.MOTIVE_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.MOTIVE_AUTHORIZE_BASE;
  delete process.env.MOTIVE_TOKEN_BASE;
  delete process.env.MOTIVE_API_BASE;
});

function mockFetchSequence(
  responses: Array<{ status?: number; json?: unknown; text?: string; headers?: Record<string, string> }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    const init = { status: r.status ?? 200, headers: r.headers };
    if (r.text !== undefined) spy.mockResolvedValueOnce(new Response(r.text, init));
    else spy.mockResolvedValueOnce(new Response(JSON.stringify(r.json), init));
  }
  return spy;
}

const SCOPES = ["companies.read", "fuel_purchases.manage"] as const;
const TOKEN_SUCCESS = {
  access_token: "motive-access-token",
  refresh_token: "motive-refresh-token",
  expires_in: 7200,
  token_type: "Bearer",
};
const COMPANIES = { companies: [{ company: { id: 8801, name: "Acme Freight" } }] };

describe("buildAuthUrl", () => {
  it("produces the account.gomotive.com authorize URL with NO PKCE params and no secret", () => {
    const url = new URL(motiveOAuth.buildAuthUrl("signed-state", [...SCOPES], null));
    // account.gomotive.com is Motive's real OAuth host (live-corrected
    // 2026-07-24) — bare gomotive.com 404s the server-side token POST.
    expect(url.origin).toBe("https://account.gomotive.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-motive-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("companies.read fuel_purchases.manage");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/motive/callback",
    );
    expect(url.searchParams.get("code_challenge")).toBeNull();
    expect(url.toString()).not.toContain("test-motive-client-secret");
  });

  it("requests ALL 11 manifest scope identifiers in the authorize URL, no duplicates", () => {
    const url = new URL(
      motiveOAuth.buildAuthUrl("state", [...motiveManifest.scopes.required], null),
    );
    const scopeParam = url.searchParams.get("scope") ?? "";
    const scopes = scopeParam.split(" ").filter((s) => s.length > 0);
    // Every required identifier is present, exactly the 11 (one per portal
    // permission row — the portal grants a single read-OR-manage variant per
    // row), no duplicates.
    expect(scopes.sort()).toEqual([...motiveManifest.scopes.required].sort());
    expect(scopes).toHaveLength(11);
    expect(new Set(scopes).size).toBe(11);
    // Spot-check the additions that gate webhooks + inspection reports.
    expect(scopes).toContain("company_webhooks.manage");
    expect(scopes).toContain("inspection_reports.read");
    expect(scopes).not.toContain("forms.read");
    // Read-and-write rows grant ONLY `.manage` — their `.read` must never be
    // requested (it 403s the whole authorize request).
    expect(scopes).not.toContain("fuel_purchases.read");
    expect(scopes).not.toContain("vehicles.read");
    expect(scopes).not.toContain("users.read");
  });
});

describe("handleCallback", () => {
  it("exchanges the code (body auth) and takes companyId from /v1/companies", async () => {
    const spy = mockFetchSequence([{ json: TOKEN_SUCCESS }, { json: COMPANIES }]);
    const result = await motiveOAuth.handleCallback("code-1", "state", null, null, {});

    const [tokenUrl, tokenInit] = spy.mock.calls[0]!;
    expect(String(tokenUrl)).toBe("https://account.gomotive.com/oauth/token");
    const body = String((tokenInit as { body?: unknown }).body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=code-1");
    expect(body).toContain("client_id=test-motive-client-id");
    expect(body).toContain("client_secret=test-motive-client-secret");

    const [companiesUrl] = spy.mock.calls[1]!;
    expect(String(companiesUrl)).toContain("/v1/companies");

    expect(result.account.providerAccountId).toBe("8801");
    expect(result.account.displayName).toBe("Acme Freight");
    expect(result.account.metadata).toMatchObject({ companyId: "8801" });
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe("motive-access-token");
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe("motive-refresh-token");
    expect(JSON.stringify(result)).not.toContain("motive-access-token");
    expect(JSON.stringify(result)).not.toContain("motive-refresh-token");
  });

  it("FAILS the connect when the grant has no company", async () => {
    mockFetchSequence([{ json: TOKEN_SUCCESS }, { json: { companies: [] } }]);
    await expect(motiveOAuth.handleCallback("code-1", "state", null, null, {})).rejects.toThrow(
      /company/i,
    );
  });

  it("fails fast when the token response has no refresh_token", async () => {
    mockFetchSequence([{ json: { ...TOKEN_SUCCESS, refresh_token: undefined } }]);
    await expect(motiveOAuth.handleCallback("code-1", "state", null, null, {})).rejects.toThrow(
      /refresh_token/,
    );
  });
});

describe("refreshToken", () => {
  it("persists the ROTATED refresh token from the response", async () => {
    mockFetchSequence([{ json: { ...TOKEN_SUCCESS, refresh_token: "rotated-refresh" } }]);
    const tokens = await motiveOAuth.refreshToken("old-refresh");
    expect(decryptToken(tokens.refreshTokenEncrypted!)).toBe("rotated-refresh");
    expect(decryptToken(tokens.accessTokenEncrypted)).toBe("motive-access-token");
  });

  it("maps invalid_grant to RefreshAuthRequiredError and never echoes the token", async () => {
    mockFetchSequence([
      { status: 400, json: { error: "invalid_grant" }, headers: { "x-request-id": "req-1" } },
    ]);
    let err: unknown;
    try {
      await motiveOAuth.refreshToken("dead-token");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RefreshAuthRequiredError);
    const logged = String((console.error as jest.Mock).mock.calls[0]![0]);
    expect(JSON.parse(logged)).toMatchObject({ event: "motive.api.error", status: 400, requestId: "req-1" });
    expect(logged).not.toContain("dead-token");
    expect(logged).not.toContain("test-motive-client-secret");
  });
});

describe("revoke", () => {
  it("is a safe no-op (Motive has no documented revoke endpoint)", async () => {
    const spy = jest.spyOn(globalThis, "fetch");
    await expect(motiveOAuth.revoke("tok")).resolves.toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });
});
