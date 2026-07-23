/**
 * @jest-environment node
 *
 * Tests for the MCP OAuth discovery module (CS-1 MCP-AUTH):
 * RFC 9728 protected-resource metadata, RFC 8414 / OIDC authorization-server
 * metadata, well-known URL construction, https enforcement, issuer-mismatch
 * and PKCE-downgrade fail-closed behavior, and the in-process TTL cache.
 * fetch is mocked at the global boundary; no network.
 */
import {
  authorizationServerMetadataUrls,
  canonicalResourceUri,
  clearMcpOAuthDiscoveryCache,
  discoverAuthorizationServer,
  discoverForResource,
  discoverProtectedResource,
  McpOAuthDiscoveryError,
  protectedResourceMetadataUrls,
} from "@/integrations/_shared/mcp/oauthDiscovery";

const PRM_DOC = {
  resource: "https://mcp.vendor.test/mcp",
  authorization_servers: ["https://as.vendor.test"],
};

const AS_DOC = {
  issuer: "https://as.vendor.test",
  authorization_endpoint: "https://as.vendor.test/authorize",
  token_endpoint: "https://as.vendor.test/token",
  registration_endpoint: "https://as.vendor.test/register",
  revocation_endpoint: "https://as.vendor.test/revoke",
  scopes_supported: ["read", "write"],
  code_challenge_methods_supported: ["S256"],
};

function mockFetchByUrl(routes: Record<string, { status?: number; json?: unknown }>) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      const route = routes[url];
      if (!route) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(route.json ?? {}), {
        status: route.status ?? 200,
      });
    });
}

beforeEach(() => {
  clearMcpOAuthDiscoveryCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("well-known URL construction", () => {
  it("RFC 9728: path-aware candidate first, root fallback second", () => {
    expect(protectedResourceMetadataUrls(new URL("https://mcp.vendor.test/mcp"))).toEqual([
      "https://mcp.vendor.test/.well-known/oauth-protected-resource/mcp",
      "https://mcp.vendor.test/.well-known/oauth-protected-resource",
    ]);
  });

  it("RFC 9728: root-path resource yields only the root candidate", () => {
    expect(protectedResourceMetadataUrls(new URL("https://mcp.vendor.test/"))).toEqual([
      "https://mcp.vendor.test/.well-known/oauth-protected-resource",
    ]);
  });

  it("RFC 8414 + OIDC: issuer without a path yields the two root forms", () => {
    expect(authorizationServerMetadataUrls(new URL("https://as.vendor.test"))).toEqual([
      "https://as.vendor.test/.well-known/oauth-authorization-server",
      "https://as.vendor.test/.well-known/openid-configuration",
    ]);
  });

  it("RFC 8414 + OIDC: issuer WITH a path yields inserted + appended forms", () => {
    expect(
      authorizationServerMetadataUrls(new URL("https://as.vendor.test/tenant1")),
    ).toEqual([
      "https://as.vendor.test/.well-known/oauth-authorization-server/tenant1",
      "https://as.vendor.test/.well-known/openid-configuration/tenant1",
      "https://as.vendor.test/tenant1/.well-known/openid-configuration",
    ]);
  });
});

describe("canonicalResourceUri (RFC 8707)", () => {
  it("lowercases scheme/host and preserves the path", () => {
    expect(canonicalResourceUri("p", "HTTPS://MCP.Vendor.TEST/mcp")).toBe(
      "https://mcp.vendor.test/mcp",
    );
  });

  it("drops a bare trailing root slash", () => {
    expect(canonicalResourceUri("p", "https://mcp.vendor.test/")).toBe(
      "https://mcp.vendor.test",
    );
  });

  it("rejects non-https (except loopback) and fragments", () => {
    expect(() => canonicalResourceUri("p", "http://mcp.vendor.test/mcp")).toThrow(
      McpOAuthDiscoveryError,
    );
    expect(canonicalResourceUri("p", "http://localhost:9999/mcp")).toBe(
      "http://localhost:9999/mcp",
    );
  });
});

describe("discoverProtectedResource", () => {
  it("uses the path-aware document when present", async () => {
    mockFetchByUrl({
      "https://mcp.vendor.test/.well-known/oauth-protected-resource/mcp": { json: PRM_DOC },
    });
    const prm = await discoverProtectedResource("p", "https://mcp.vendor.test/mcp");
    expect(prm.resource).toBe("https://mcp.vendor.test/mcp");
    expect(prm.authorizationServers).toEqual(["https://as.vendor.test"]);
  });

  it("falls back to the root document on a path-aware 404", async () => {
    const spy = mockFetchByUrl({
      "https://mcp.vendor.test/.well-known/oauth-protected-resource": { json: PRM_DOC },
    });
    const prm = await discoverProtectedResource("p", "https://mcp.vendor.test/mcp");
    expect(prm.authorizationServers).toEqual(["https://as.vendor.test"]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("fails when no document exists at either candidate", async () => {
    mockFetchByUrl({});
    await expect(
      discoverProtectedResource("p", "https://mcp.vendor.test/mcp"),
    ).rejects.toThrow(/no protected-resource metadata/);
  });

  it("fails on a document missing authorization_servers", async () => {
    mockFetchByUrl({
      "https://mcp.vendor.test/.well-known/oauth-protected-resource/mcp": {
        json: { resource: "https://mcp.vendor.test/mcp", authorization_servers: [] },
      },
    });
    await expect(
      discoverProtectedResource("p", "https://mcp.vendor.test/mcp"),
    ).rejects.toThrow(/authorization_servers/);
  });

  it("fails on a non-https advertised authorization server", async () => {
    mockFetchByUrl({
      "https://mcp.vendor.test/.well-known/oauth-protected-resource/mcp": {
        json: { ...PRM_DOC, authorization_servers: ["http://evil.vendor.test"] },
      },
    });
    await expect(
      discoverProtectedResource("p", "https://mcp.vendor.test/mcp"),
    ).rejects.toThrow(/must be https/);
  });

  it("refuses a redirecting metadata endpoint (no silent follow)", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 301, headers: { location: "https://elsewhere.test" } }),
    );
    await expect(
      discoverProtectedResource("p", "https://mcp.vendor.test/mcp"),
    ).rejects.toThrow(/redirected/);
  });

  it("throws (does NOT fall through) on a 500 from the primary candidate", async () => {
    mockFetchByUrl({
      "https://mcp.vendor.test/.well-known/oauth-protected-resource/mcp": {
        status: 500,
        json: {},
      },
      "https://mcp.vendor.test/.well-known/oauth-protected-resource": { json: PRM_DOC },
    });
    await expect(
      discoverProtectedResource("p", "https://mcp.vendor.test/mcp"),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("rejects a plain-http resource URL outright (no fetch)", async () => {
    const spy = jest.spyOn(globalThis, "fetch");
    await expect(
      discoverProtectedResource("p", "http://mcp.vendor.test/mcp"),
    ).rejects.toThrow(/must be https/);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("discoverAuthorizationServer", () => {
  it("returns typed metadata from the RFC 8414 document", async () => {
    mockFetchByUrl({
      "https://as.vendor.test/.well-known/oauth-authorization-server": { json: AS_DOC },
    });
    const as = await discoverAuthorizationServer("p", "https://as.vendor.test");
    expect(as.authorizationEndpoint).toBe("https://as.vendor.test/authorize");
    expect(as.tokenEndpoint).toBe("https://as.vendor.test/token");
    expect(as.registrationEndpoint).toBe("https://as.vendor.test/register");
    expect(as.revocationEndpoint).toBe("https://as.vendor.test/revoke");
    expect(as.scopesSupported).toEqual(["read", "write"]);
  });

  it("falls back to the OIDC discovery document", async () => {
    mockFetchByUrl({
      "https://as.vendor.test/.well-known/openid-configuration": { json: AS_DOC },
    });
    const as = await discoverAuthorizationServer("p", "https://as.vendor.test");
    expect(as.tokenEndpoint).toBe("https://as.vendor.test/token");
  });

  it("fails closed on issuer mismatch (RFC 8414 §3.3)", async () => {
    mockFetchByUrl({
      "https://as.vendor.test/.well-known/oauth-authorization-server": {
        json: { ...AS_DOC, issuer: "https://other.vendor.test" },
      },
    });
    await expect(
      discoverAuthorizationServer("p", "https://as.vendor.test"),
    ).rejects.toThrow(/issuer mismatch/);
  });

  it("tolerates a trailing-slash issuer difference and nothing looser", async () => {
    mockFetchByUrl({
      "https://as.vendor.test/.well-known/oauth-authorization-server": {
        json: { ...AS_DOC, issuer: "https://as.vendor.test/" },
      },
    });
    const as = await discoverAuthorizationServer("p", "https://as.vendor.test");
    expect(as.issuer).toBe("https://as.vendor.test/");
  });

  it("fails closed when PKCE methods are advertised WITHOUT S256", async () => {
    mockFetchByUrl({
      "https://as.vendor.test/.well-known/oauth-authorization-server": {
        json: { ...AS_DOC, code_challenge_methods_supported: ["plain"] },
      },
    });
    await expect(
      discoverAuthorizationServer("p", "https://as.vendor.test"),
    ).rejects.toThrow(/PKCE S256/);
  });

  it("proceeds when code_challenge_methods_supported is absent (RFC 8414 optional)", async () => {
    const { code_challenge_methods_supported: _omit, ...doc } = AS_DOC;
    mockFetchByUrl({
      "https://as.vendor.test/.well-known/oauth-authorization-server": { json: doc },
    });
    const as = await discoverAuthorizationServer("p", "https://as.vendor.test");
    expect(as.tokenEndpoint).toBe("https://as.vendor.test/token");
  });

  it("fails on missing endpoints or non-https endpoints", async () => {
    mockFetchByUrl({
      "https://as.vendor.test/.well-known/oauth-authorization-server": {
        json: { issuer: "https://as.vendor.test", authorization_endpoint: "https://as.vendor.test/a" },
      },
    });
    await expect(
      discoverAuthorizationServer("p", "https://as.vendor.test"),
    ).rejects.toThrow(/token_endpoint/);

    clearMcpOAuthDiscoveryCache();
    jest.restoreAllMocks();
    mockFetchByUrl({
      "https://as.vendor.test/.well-known/oauth-authorization-server": {
        json: { ...AS_DOC, token_endpoint: "http://as.vendor.test/token" },
      },
    });
    await expect(
      discoverAuthorizationServer("p", "https://as.vendor.test"),
    ).rejects.toThrow(/must be https/);
  });
});

describe("caching", () => {
  it("caches discovery per URL and honors clearMcpOAuthDiscoveryCache", async () => {
    const spy = mockFetchByUrl({
      "https://mcp.vendor.test/.well-known/oauth-protected-resource/mcp": { json: PRM_DOC },
      "https://as.vendor.test/.well-known/oauth-authorization-server": { json: AS_DOC },
    });

    await discoverForResource("p", "https://mcp.vendor.test/mcp");
    expect(spy).toHaveBeenCalledTimes(2); // PRM + AS

    await discoverForResource("p", "https://mcp.vendor.test/mcp");
    expect(spy).toHaveBeenCalledTimes(2); // fully cached

    clearMcpOAuthDiscoveryCache();
    await discoverForResource("p", "https://mcp.vendor.test/mcp");
    expect(spy).toHaveBeenCalledTimes(4); // re-fetched after clear
  });
});
