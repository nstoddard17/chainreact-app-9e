/**
 * @jest-environment node
 *
 * Tests for the shared MCP OAuth helper factory (CS-1 MCP-AUTH) in
 * DISCOVERED endpoint mode — the RFC 9728/8414 + RFC 8707 path future
 * MCP-catalog providers use when their auth home is the vendor's MCP AS.
 * (Static mode is exercised end-to-end by the Linear provider tests.)
 *
 * Real encryption via a test TOKEN_ENCRYPTION_KEY; fetch mocked at the global
 * boundary. Proves: async buildAuthUrl with discovery + resource param + PKCE,
 * token exchange body shape (public vs confidential client), refresh
 * rotate-or-preserve + invalid_grant mapping, metadata-driven revocation, and
 * that no plaintext token appears in persisted shapes.
 */
import { decryptToken } from "@/core/encryption/tokens";
import { RefreshAuthRequiredError } from "@/contracts/integration";
import { createMcpProviderOAuth } from "@/integrations/_shared/mcp/oauth";
import { clearMcpOAuthDiscoveryCache } from "@/integrations/_shared/mcp/oauthDiscovery";

const TOKEN_KEY = (() => {
  const bytes = Buffer.alloc(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 29) % 256;
  return bytes.toString("base64");
})();

const PRM_URL = "https://mcp.vendor.test/.well-known/oauth-protected-resource/mcp";
const AS_URL = "https://as.vendor.test/.well-known/oauth-authorization-server";

const PRM_DOC = {
  resource: "https://mcp.vendor.test/mcp",
  authorization_servers: ["https://as.vendor.test"],
};

const AS_DOC = {
  issuer: "https://as.vendor.test",
  authorization_endpoint: "https://as.vendor.test/authorize",
  token_endpoint: "https://as.vendor.test/token",
  revocation_endpoint: "https://as.vendor.test/revoke",
  code_challenge_methods_supported: ["S256"],
};

type Route = { status?: number; json?: unknown };

function mockFetchByUrl(routes: Record<string, Route>) {
  const calls: Array<{ url: string; init: Parameters<typeof fetch>[1] }> = [];
  const spy = jest
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      calls.push({ url, init });
      const route = routes[url];
      if (!route) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(route.json ?? {}), { status: route.status ?? 200 });
    });
  return { spy, calls };
}

function makeOAuth(opts?: { withSecret?: boolean }) {
  return createMcpProviderOAuth({
    provider: "vendortest",
    endpoints: { kind: "discovered", resourceUrl: () => "https://mcp.vendor.test/mcp" },
    clientId: () => "client-abc",
    ...(opts?.withSecret ? { clientSecret: () => "secret-xyz" } : {}),
    redirectUri: () => "https://app.example.test/api/integrations/oauth/vendortest/callback",
    requireRefreshToken: true,
    resolveAccount: async ({ accessToken }) => ({
      providerAccountId: `acct-for-${accessToken.slice(0, 4)}`,
      displayName: "Vendor User",
      metadata: { probe: true },
    }),
  });
}

const PKCE_IN = { codeVerifier: "verifier-abc", codeChallengeMethod: "S256" };

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = TOKEN_KEY;
  clearMcpOAuthDiscoveryCache();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

describe("generatePkce", () => {
  it("emits fresh S256 pairs", () => {
    const oauth = makeOAuth();
    const a = oauth.generatePkce!();
    const b = oauth.generatePkce!();
    expect(a.codeChallengeMethod).toBe("S256");
    expect(a.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});

describe("buildAuthUrl (discovered mode — async)", () => {
  it("discovers endpoints and embeds client, PKCE, and the RFC 8707 resource", async () => {
    mockFetchByUrl({ [PRM_URL]: { json: PRM_DOC }, [AS_URL]: { json: AS_DOC } });
    const oauth = makeOAuth();
    const result = oauth.buildAuthUrl("state-1", ["read", "write"], {
      codeChallenge: "chal-1",
      codeChallengeMethod: "S256",
    });
    expect(result).toBeInstanceOf(Promise);
    const url = new URL(await result);
    expect(url.origin + url.pathname).toBe("https://as.vendor.test/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-abc");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("read write");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("code_challenge")).toBe("chal-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("resource")).toBe("https://mcp.vendor.test/mcp");
  });

  it("throws when the dispatcher failed to thread a PKCE challenge", () => {
    const oauth = makeOAuth();
    expect(() => oauth.buildAuthUrl("s", ["read"], null)).toThrow(/PKCE challenge is required/);
  });

  it("propagates discovery failures", async () => {
    mockFetchByUrl({});
    const oauth = makeOAuth();
    await expect(
      oauth.buildAuthUrl("s", ["read"], { codeChallenge: "c", codeChallengeMethod: "S256" }),
    ).rejects.toThrow(/discovery failed/);
  });
});

describe("handleCallback (discovered mode)", () => {
  const tokenSuccess = {
    access_token: "at-plain",
    refresh_token: "rt-plain",
    expires_in: 3600,
    scope: "read write",
  };

  it("exchanges the code with PKCE verifier + resource; encrypts tokens (public client)", async () => {
    const { calls } = mockFetchByUrl({
      [PRM_URL]: { json: PRM_DOC },
      [AS_URL]: { json: AS_DOC },
      "https://as.vendor.test/token": { json: tokenSuccess },
    });
    const oauth = makeOAuth();
    const result = await oauth.handleCallback("code-1", "state", PKCE_IN);

    const tokenCall = calls.find((c) => c.url === "https://as.vendor.test/token")!;
    const body = new URLSearchParams(String(tokenCall.init?.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe("client-abc");
    expect(body.get("client_secret")).toBeNull(); // public client — PKCE only
    expect(body.get("code")).toBe("code-1");
    expect(body.get("code_verifier")).toBe("verifier-abc");
    expect(body.get("resource")).toBe("https://mcp.vendor.test/mcp");
    expect(body.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/vendortest/callback",
    );

    expect(decryptToken(result.tokens.accessTokenEncrypted)).toBe("at-plain");
    expect(result.tokens.accessTokenEncrypted).not.toContain("at-plain");
    expect(decryptToken(result.tokens.refreshTokenEncrypted!)).toBe("rt-plain");
    expect(result.tokens.scopes).toEqual(["read", "write"]);
    expect(result.tokens.accessTokenExpiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(result.account.providerAccountId).toBe("acct-for-at-p");
  });

  it("sends client_secret for confidential clients", async () => {
    const { calls } = mockFetchByUrl({
      [PRM_URL]: { json: PRM_DOC },
      [AS_URL]: { json: AS_DOC },
      "https://as.vendor.test/token": { json: tokenSuccess },
    });
    const oauth = makeOAuth({ withSecret: true });
    await oauth.handleCallback("c", "s", PKCE_IN);
    const tokenCall = calls.find((c) => c.url === "https://as.vendor.test/token")!;
    const body = new URLSearchParams(String(tokenCall.init?.body));
    expect(body.get("client_secret")).toBe("secret-xyz");
  });

  it("refuses the exchange without a PKCE verifier", async () => {
    const oauth = makeOAuth();
    await expect(oauth.handleCallback("c", "s", null)).rejects.toThrow(/code_verifier/);
  });

  it("fails the connect when requireRefreshToken is set and none arrives", async () => {
    mockFetchByUrl({
      [PRM_URL]: { json: PRM_DOC },
      [AS_URL]: { json: AS_DOC },
      "https://as.vendor.test/token": {
        json: { access_token: "at", expires_in: 3600 },
      },
    });
    const oauth = makeOAuth();
    await expect(oauth.handleCallback("c", "s", PKCE_IN)).rejects.toThrow(
      /missing refresh_token/,
    );
  });

  it("surfaces only the bare OAuth error code on a failed exchange", async () => {
    mockFetchByUrl({
      [PRM_URL]: { json: PRM_DOC },
      [AS_URL]: { json: AS_DOC },
      "https://as.vendor.test/token": {
        status: 400,
        json: { error: "invalid_request", error_description: "SECRET-DETAIL do not leak" },
      },
    });
    const oauth = makeOAuth();
    await expect(oauth.handleCallback("c", "s", PKCE_IN)).rejects.toThrow(
      /token exchange failed: invalid_request/,
    );
    await expect(oauth.handleCallback("c", "s", PKCE_IN)).rejects.not.toThrow(/SECRET-DETAIL/);
  });
});

describe("refreshToken (discovered mode)", () => {
  it("sends resource + client creds; ROTATES when a new refresh token arrives", async () => {
    const { calls } = mockFetchByUrl({
      [PRM_URL]: { json: PRM_DOC },
      [AS_URL]: { json: AS_DOC },
      "https://as.vendor.test/token": {
        json: { access_token: "at-new", refresh_token: "rt-rotated", expires_in: 3600 },
      },
    });
    const oauth = makeOAuth();
    const tokens = await oauth.refreshToken("rt-original");
    const tokenCall = calls.find((c) => c.url === "https://as.vendor.test/token")!;
    const body = new URLSearchParams(String(tokenCall.init?.body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-original");
    expect(body.get("resource")).toBe("https://mcp.vendor.test/mcp");
    expect(decryptToken(tokens.accessTokenEncrypted)).toBe("at-new");
    expect(decryptToken(tokens.refreshTokenEncrypted!)).toBe("rt-rotated");
  });

  it("PRESERVES the original refresh token when none is returned", async () => {
    mockFetchByUrl({
      [PRM_URL]: { json: PRM_DOC },
      [AS_URL]: { json: AS_DOC },
      "https://as.vendor.test/token": { json: { access_token: "at-new" } },
    });
    const oauth = makeOAuth();
    const tokens = await oauth.refreshToken("rt-original");
    expect(decryptToken(tokens.refreshTokenEncrypted!)).toBe("rt-original");
  });

  it("maps invalid_grant to RefreshAuthRequiredError; other failures stay generic", async () => {
    mockFetchByUrl({
      [PRM_URL]: { json: PRM_DOC },
      [AS_URL]: { json: AS_DOC },
      "https://as.vendor.test/token": { status: 400, json: { error: "invalid_grant" } },
    });
    const oauth = makeOAuth();
    await expect(oauth.refreshToken("rt-dead")).rejects.toBeInstanceOf(RefreshAuthRequiredError);

    clearMcpOAuthDiscoveryCache();
    jest.restoreAllMocks();
    mockFetchByUrl({
      [PRM_URL]: { json: PRM_DOC },
      [AS_URL]: { json: AS_DOC },
      "https://as.vendor.test/token": { status: 500, json: {} },
    });
    const err = await makeOAuth()
      .refreshToken("rt")
      .catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(RefreshAuthRequiredError);
    expect(String(err)).toMatch(/token refresh failed/);
  });
});

describe("revoke (discovered mode)", () => {
  it("posts to the metadata-advertised revocation endpoint", async () => {
    const { calls } = mockFetchByUrl({
      [PRM_URL]: { json: PRM_DOC },
      [AS_URL]: { json: AS_DOC },
      "https://as.vendor.test/revoke": { json: {} },
    });
    await makeOAuth().revoke("tok-1");
    const revokeCall = calls.find((c) => c.url === "https://as.vendor.test/revoke")!;
    const body = new URLSearchParams(String(revokeCall.init?.body));
    expect(body.get("token")).toBe("tok-1");
    expect(body.get("client_id")).toBe("client-abc");
  });

  it("no-ops when the AS advertises no revocation endpoint", async () => {
    const { revocation_endpoint: _omit, ...asDoc } = AS_DOC;
    const { calls } = mockFetchByUrl({
      [PRM_URL]: { json: PRM_DOC },
      [AS_URL]: { json: asDoc },
    });
    await makeOAuth().revoke("tok-1");
    expect(calls.every((c) => !c.url.includes("revoke"))).toBe(true);
  });
});
