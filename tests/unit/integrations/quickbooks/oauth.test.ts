/**
 * @jest-environment node
 *
 * Tests for quickbooksOAuth — QUICKBOOKS-1.
 *
 * Strategy mirrors calendly/typeform oauth tests (real encryption via a
 * test TOKEN_ENCRYPTION_KEY, fetch mocked at the global boundary).
 * Covers the non-PKCE authorize-URL shape, Basic-auth token exchange,
 * the realmId-from-callbackParams contract (missing realmId FAILS the
 * connect BEFORE any token exchange), CompanyInfo display-identity
 * degradation, missing refresh_token fail-fast, refresh-token ROTATION
 * persistence, and the invalid_grant → RefreshAuthRequiredError
 * mapping. No plaintext token or client secret ever appears in the
 * persisted shapes or the browser-visible URL.
 */
import { decryptToken } from "@/core/encryption/tokens";
import { RefreshAuthRequiredError } from "@/contracts/integration";
import { quickbooksOAuth } from "@/integrations/quickbooks/oauth";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37) % 256;
  return bytes.toString("base64");
})();

beforeEach(() => {
  process.env.QUICKBOOKS_CLIENT_ID = "test-qbo-client-id";
  process.env.QUICKBOOKS_CLIENT_SECRET = "test-qbo-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
  // Silence + capture the sanitized `quickbooks.api.error` troubleshooting log.
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.QUICKBOOKS_CLIENT_ID;
  delete process.env.QUICKBOOKS_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
  delete process.env.QUICKBOOKS_AUTHORIZE_BASE;
  delete process.env.QUICKBOOKS_TOKEN_BASE;
  delete process.env.QUICKBOOKS_API_BASE;
});

function mockFetchSequence(
  responses: Array<{
    status?: number;
    json?: unknown;
    text?: string;
    headers?: Record<string, string>;
  }>,
) {
  const spy = jest.spyOn(globalThis, "fetch");
  for (const r of responses) {
    const status = r.status ?? 200;
    const init = { status, headers: r.headers };
    if (r.text !== undefined) {
      spy.mockResolvedValueOnce(new Response(r.text, init));
    } else {
      spy.mockResolvedValueOnce(new Response(JSON.stringify(r.json), init));
    }
  }
  return spy;
}

const SCOPES = ["com.intuit.quickbooks.accounting"] as const;

const EXPECTED_BASIC = `Basic ${Buffer.from(
  "test-qbo-client-id:test-qbo-client-secret",
  "utf8",
).toString("base64")}`;

const TOKEN_SUCCESS = {
  access_token: "qbo-access-token",
  refresh_token: "qbo-refresh-token",
  expires_in: 3600,
  x_refresh_token_expires_in: 8640000,
  token_type: "bearer",
};

const COMPANY_INFO = {
  CompanyInfo: { CompanyName: "Acme Books LLC", Country: "US" },
};

describe("buildAuthUrl", () => {
  it("produces the documented appcenter URL with NO PKCE params", () => {
    const url = new URL(
      quickbooksOAuth.buildAuthUrl("signed-state", [...SCOPES], null),
    );
    expect(url.origin).toBe("https://appcenter.intuit.com");
    expect(url.pathname).toBe("/connect/oauth2");
    expect(url.searchParams.get("client_id")).toBe("test-qbo-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(
      "com.intuit.quickbooks.accounting",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/quickbooks/callback",
    );
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("code_challenge")).toBeNull();
    expect(url.searchParams.get("code_challenge_method")).toBeNull();
    // Never the client secret in the browser-visible URL.
    expect(url.toString()).not.toContain("test-qbo-client-secret");
  });
});

describe("handleCallback", () => {
  it("FAILS BEFORE the token exchange when realmId is missing from callbackParams", async () => {
    const spy = jest.spyOn(globalThis, "fetch");
    await expect(
      quickbooksOAuth.handleCallback("code-1", "state", null, null, {}),
    ).rejects.toThrow(/realmId/);
    await expect(
      quickbooksOAuth.handleCallback("code-1", "state", null, null, null),
    ).rejects.toThrow(/realmId/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("exchanges the code with Basic auth and persists realmId as providerAccountId + metadata", async () => {
    const spy = mockFetchSequence([
      { json: TOKEN_SUCCESS },
      { json: COMPANY_INFO },
    ]);

    const result = await quickbooksOAuth.handleCallback(
      "code-1",
      "state",
      null,
      null,
      { realmId: "9130350000000" },
    );

    // Token exchange wire shape.
    const [tokenUrl, tokenInit] = spy.mock.calls[0]!;
    expect(String(tokenUrl)).toBe(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    );
    const headers = (tokenInit as { headers?: Record<string, string> }).headers!;
    expect(headers.Authorization).toBe(EXPECTED_BASIC);
    const body = String((tokenInit as { body?: unknown }).body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=code-1");

    // CompanyInfo call is realm-scoped with minorversion.
    const [companyUrl] = spy.mock.calls[1]!;
    expect(String(companyUrl)).toContain(
      "/v3/company/9130350000000/companyinfo/9130350000000",
    );
    expect(String(companyUrl)).toContain("minorversion=75");

    // Account shape.
    expect(result.account.providerAccountId).toBe("9130350000000");
    expect(result.account.displayName).toBe("Acme Books LLC");
    expect(result.account.metadata).toMatchObject({
      realmId: "9130350000000",
      companyName: "Acme Books LLC",
      country: "US",
    });

    // Tokens encrypted at rest; decrypt round-trips.
    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe(
      "qbo-access-token",
    );
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe(
      "qbo-refresh-token",
    );
    expect(result.tokens.scopes).toEqual(["com.intuit.quickbooks.accounting"]);
    // No plaintext token in the persisted JSON shape.
    expect(JSON.stringify(result)).not.toContain("qbo-access-token");
    expect(JSON.stringify(result)).not.toContain("qbo-refresh-token");
  });

  it("degrades to the realmId as displayName when CompanyInfo fails, capturing intuit_tid in a sanitized log", async () => {
    mockFetchSequence([
      { json: TOKEN_SUCCESS },
      { status: 500, text: "boom", headers: { intuit_tid: "tid-company-info" } },
    ]);
    const result = await quickbooksOAuth.handleCallback(
      "code-1",
      "state",
      null,
      null,
      { realmId: "42" },
    );
    expect(result.account.displayName).toBe("42");
    expect(result.account.metadata).toMatchObject({
      realmId: "42",
      companyName: null,
    });
    // The failing connect-time CompanyInfo read logs its intuit_tid, sanitized.
    const logged = String((console.error as jest.Mock).mock.calls[0]![0]);
    expect(JSON.parse(logged)).toMatchObject({
      event: "quickbooks.api.error",
      path: "/companyinfo",
      status: 500,
      intuitTid: "tid-company-info",
    });
    expect(logged).not.toContain("qbo-access-token");
    expect(logged).not.toContain("boom");
  });

  it("fails fast when the token response has no refresh_token", async () => {
    mockFetchSequence([
      { json: { ...TOKEN_SUCCESS, refresh_token: undefined } },
    ]);
    await expect(
      quickbooksOAuth.handleCallback("code-1", "state", null, null, {
        realmId: "42",
      }),
    ).rejects.toThrow(/refresh_token/);
  });

  it("surfaces token-exchange failures without echoing the body", async () => {
    mockFetchSequence([
      {
        status: 400,
        json: { error: "invalid_grant", error_description: "bad code" },
      },
    ]);
    await expect(
      quickbooksOAuth.handleCallback("code-1", "state", null, null, {
        realmId: "42",
      }),
    ).rejects.toThrow(/invalid_grant/);
  });
});

describe("refreshToken", () => {
  it("persists the ROTATED refresh token from the response", async () => {
    mockFetchSequence([
      { json: { ...TOKEN_SUCCESS, refresh_token: "rotated-refresh" } },
    ]);
    const tokens = await quickbooksOAuth.refreshToken("old-refresh");
    expect(decryptToken(tokens.refreshTokenEncrypted!)).toBe("rotated-refresh");
    expect(decryptToken(tokens.accessTokenEncrypted)).toBe("qbo-access-token");
  });

  it("falls back to the old refresh token only when the response omits one", async () => {
    mockFetchSequence([
      { json: { ...TOKEN_SUCCESS, refresh_token: undefined } },
    ]);
    const tokens = await quickbooksOAuth.refreshToken("old-refresh");
    expect(decryptToken(tokens.refreshTokenEncrypted!)).toBe("old-refresh");
  });

  it("maps invalid_grant to RefreshAuthRequiredError and logs the intuit_tid", async () => {
    mockFetchSequence([
      {
        status: 400,
        json: { error: "invalid_grant" },
        headers: { intuit_tid: "tid-refresh" },
      },
    ]);
    await expect(quickbooksOAuth.refreshToken("dead")).rejects.toBeInstanceOf(
      RefreshAuthRequiredError,
    );
    const logged = String((console.error as jest.Mock).mock.calls[0]![0]);
    expect(JSON.parse(logged)).toMatchObject({
      event: "quickbooks.api.error",
      status: 400,
      intuitTid: "tid-refresh",
    });
    // Never the refresh token or the Basic client-secret header.
    expect(logged).not.toContain("dead");
    expect(logged).not.toContain("test-qbo-client-secret");
  });

  it("sends Basic auth on refresh", async () => {
    const spy = mockFetchSequence([{ json: TOKEN_SUCCESS }]);
    await quickbooksOAuth.refreshToken("old-refresh");
    const [, init] = spy.mock.calls[0]!;
    const headers = (init as { headers?: Record<string, string> }).headers!;
    expect(headers.Authorization).toBe(EXPECTED_BASIC);
  });
});

describe("revoke", () => {
  it("POSTs the token to Intuit's revoke endpoint with Basic auth and JSON body", async () => {
    const spy = mockFetchSequence([{ status: 200, text: "" }]);
    await expect(quickbooksOAuth.revoke("qbo-access-token")).resolves.toBeUndefined();

    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
    );
    const typedInit = init as {
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
    };
    expect(typedInit.method).toBe("POST");
    expect(typedInit.headers!.Authorization).toBe(EXPECTED_BASIC);
    expect(typedInit.headers!["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(typedInit.body))).toEqual({
      token: "qbo-access-token",
    });
  });

  it("honours the QUICKBOOKS_REVOKE_BASE override", async () => {
    process.env.QUICKBOOKS_REVOKE_BASE = "https://revoke.example.test";
    const spy = mockFetchSequence([{ status: 200, text: "" }]);
    await quickbooksOAuth.revoke("t");
    expect(String(spy.mock.calls[0]![0])).toBe(
      "https://revoke.example.test/v2/oauth2/tokens/revoke",
    );
    delete process.env.QUICKBOOKS_REVOKE_BASE;
  });

  it("throws on a non-2xx response so the caller's retry/audit policy owns it", async () => {
    mockFetchSequence([{ status: 400, json: { error: "invalid_token" } }]);
    await expect(quickbooksOAuth.revoke("dead")).rejects.toThrow(
      /invalid_token/,
    );
  });

  it("never surfaces the token value in the failure message", async () => {
    // Non-JSON 500 body → readQuickbooksErrorCode maps to `HTTP 500`, never
    // echoing the body. The token is never interpolated into the message.
    mockFetchSequence([{ status: 500, text: "boom" }]);
    let message = "";
    try {
      await quickbooksOAuth.revoke("the-secret-token");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/revocation failed: HTTP 500/);
    expect(message).not.toContain("the-secret-token");
    expect(message).not.toContain("boom");
  });
});
