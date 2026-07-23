/**
 * MCP OAuth 2.1 discovery — RFC 9728 Protected Resource Metadata + RFC 8414
 * Authorization Server Metadata (with OIDC-discovery fallback), per the MCP
 * authorization spec (protocol revision 2025-06-18).
 *
 * Used by `integrations/_shared/mcp/oauth.ts` (the shared ProviderOAuth
 * factory) at connect / callback / refresh time to resolve the authorize and
 * token endpoints for a remote MCP server. CS-1 of
 * docs/slices/phase-5/mcp-integration-layer-architecture-plan.md.
 *
 * Security posture:
 *   - The resource (MCP server) URL is always CODE-CONFIGURED per catalog
 *     provider — never user input — so discovery fetches only reach vendor
 *     hosts ChainReact committed to. (Customer-supplied servers are a later,
 *     separately-hardened tier; do NOT feed user URLs through this module.)
 *   - HTTPS is enforced on the resource URL, every discovery URL, and every
 *     endpoint read out of metadata. Plain HTTP is permitted ONLY for
 *     localhost/127.0.0.1 (e2e mock servers) — mirroring how provider
 *     `*_BASE` env overrides are used elsewhere in `integrations/`.
 *   - Discovery documents are parsed as JSON and reduced to a minimal typed
 *     shape; raw bodies are never logged or surfaced in errors.
 *   - RFC 8414 §3.3: the metadata's `issuer` must equal the issuer the
 *     document was fetched for (defense against AS mix-up).
 *   - MCP requires PKCE S256: when the AS advertises
 *     `code_challenge_methods_supported` WITHOUT `S256`, discovery fails
 *     closed rather than downgrade.
 *
 * Results are cached in-process with a short TTL: connect + callback for the
 * same provider normally hit the cache, and a vendor endpoint move heals on
 * the next TTL expiry without a deploy.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** RFC 9728 Protected Resource Metadata — the fields V2 consumes. */
export interface ProtectedResourceMetadata {
  /** Canonical resource identifier the server declares (RFC 8707 audience). */
  readonly resource: string;
  /** Issuer URL(s) of the authorization server(s) that protect the resource. */
  readonly authorizationServers: readonly string[];
}

/** RFC 8414 / OIDC discovery — the fields V2 consumes. */
export interface AuthorizationServerMetadata {
  readonly issuer: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  /** RFC 7591 Dynamic Client Registration endpoint, when advertised. */
  readonly registrationEndpoint: string | null;
  /** RFC 7009 revocation endpoint, when advertised. */
  readonly revocationEndpoint: string | null;
  readonly scopesSupported: readonly string[] | null;
}

/**
 * Thrown on any discovery failure (unreachable metadata, malformed JSON,
 * https violation, issuer mismatch, missing endpoints, PKCE downgrade).
 * Message carries the provider slug + a SAFE reason — never a response body.
 */
export class McpOAuthDiscoveryError extends Error {
  readonly provider: string;
  constructor(provider: string, reason: string) {
    super(`MCP OAuth discovery failed for '${provider}': ${reason}`);
    this.name = "McpOAuthDiscoveryError";
    this.provider = provider;
  }
}

// ─── URL validation ──────────────────────────────────────────────────────────

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

/**
 * Parse + validate a URL that participates in the OAuth flow. HTTPS required
 * everywhere except loopback (e2e mock servers). Fragments are rejected
 * (RFC 8414 forbids them on endpoints; RFC 8707 canonical resources omit them).
 */
export function assertHttpsUrl(
  provider: string,
  raw: string,
  what: string,
): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new McpOAuthDiscoveryError(provider, `${what} is not a valid URL`);
  }
  const httpsOk =
    url.protocol === "https:" ||
    (url.protocol === "http:" && isLoopbackHost(url.hostname));
  if (!httpsOk) {
    throw new McpOAuthDiscoveryError(provider, `${what} must be https`);
  }
  if (url.hash) {
    throw new McpOAuthDiscoveryError(provider, `${what} must not carry a fragment`);
  }
  return url;
}

/**
 * RFC 8707 canonical resource form for the `resource` parameter: lowercase
 * scheme/host, no fragment, path preserved, no trailing-slash addition.
 */
export function canonicalResourceUri(provider: string, resourceUrl: string): string {
  const url = assertHttpsUrl(provider, resourceUrl, "MCP resource URL");
  // URL normalizes scheme/host casing already; strip any search/hash noise.
  url.hash = "";
  return url.origin + (url.pathname === "/" ? "" : url.pathname);
}

// ─── Well-known URL construction ─────────────────────────────────────────────

/**
 * RFC 9728 §3: well-known URI is formed by inserting
 * `/.well-known/oauth-protected-resource` between host and path. Try the
 * path-aware form first (for resources like https://mcp.example.com/mcp),
 * then the root form (some servers publish only the root document).
 */
export function protectedResourceMetadataUrls(resourceUrl: URL): string[] {
  const candidates: string[] = [];
  if (resourceUrl.pathname !== "/" && resourceUrl.pathname !== "") {
    candidates.push(
      `${resourceUrl.origin}/.well-known/oauth-protected-resource${resourceUrl.pathname}`,
    );
  }
  candidates.push(`${resourceUrl.origin}/.well-known/oauth-protected-resource`);
  return candidates;
}

/**
 * RFC 8414 §3 + OIDC discovery, in the MCP spec's probe order. For an issuer
 * with a path component the RFC form inserts the well-known segment between
 * host and path; the OIDC form appends it. Issuers without a path collapse
 * to the two root forms.
 */
export function authorizationServerMetadataUrls(issuerUrl: URL): string[] {
  const { origin, pathname } = issuerUrl;
  const hasPath = pathname !== "/" && pathname !== "";
  const candidates = [
    hasPath
      ? `${origin}/.well-known/oauth-authorization-server${pathname}`
      : `${origin}/.well-known/oauth-authorization-server`,
    hasPath
      ? `${origin}/.well-known/openid-configuration${pathname}`
      : `${origin}/.well-known/openid-configuration`,
  ];
  if (hasPath) {
    candidates.push(`${origin}${pathname}/.well-known/openid-configuration`);
  }
  return candidates;
}

// ─── Fetch + cache ───────────────────────────────────────────────────────────

const DISCOVERY_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAtMs: number;
}

const prmCache = new Map<string, CacheEntry<ProtectedResourceMetadata>>();
const asCache = new Map<string, CacheEntry<AuthorizationServerMetadata>>();

/** Test hook — clears the in-process discovery caches. */
export function clearMcpOAuthDiscoveryCache(): void {
  prmCache.clear();
  asCache.clear();
}

function cacheGet<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAtMs <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
  cache.set(key, { value, expiresAtMs: Date.now() + CACHE_TTL_MS });
}

/**
 * Fetch one well-known document. Returns the parsed JSON object, or null on
 * 404 (caller tries the next candidate URL). Any other failure throws —
 * a 500/timeout on the primary candidate must not silently fall through to
 * a stale root document.
 */
async function fetchWellKnown(
  provider: string,
  url: string,
): Promise<Record<string, unknown> | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
  } catch {
    throw new McpOAuthDiscoveryError(provider, `metadata fetch failed (network/timeout)`);
  }
  if (res.status === 404) return null;
  // Well-known endpoints must answer directly; a redirect here is a
  // misconfiguration signal (and a mix-up risk), not something to follow.
  if (res.status >= 300 && res.status < 400) {
    throw new McpOAuthDiscoveryError(provider, `metadata endpoint redirected (HTTP ${res.status})`);
  }
  if (!res.ok) {
    throw new McpOAuthDiscoveryError(provider, `metadata fetch returned HTTP ${res.status}`);
  }
  try {
    const parsed: unknown = await res.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new McpOAuthDiscoveryError(provider, "metadata document is not a JSON object");
  }
}

function readString(doc: Record<string, unknown>, key: string): string | null {
  const v = doc[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function readStringArray(doc: Record<string, unknown>, key: string): string[] | null {
  const v = doc[key];
  if (!Array.isArray(v)) return null;
  const out = v.filter((x): x is string => typeof x === "string");
  return out;
}

// ─── Public discovery API ────────────────────────────────────────────────────

/**
 * RFC 9728 — resolve which authorization server(s) protect the MCP resource.
 */
export async function discoverProtectedResource(
  provider: string,
  resourceUrl: string,
): Promise<ProtectedResourceMetadata> {
  const parsed = assertHttpsUrl(provider, resourceUrl, "MCP resource URL");
  const cacheKey = parsed.toString();
  const cached = cacheGet(prmCache, cacheKey);
  if (cached) return cached;

  let doc: Record<string, unknown> | null = null;
  for (const candidate of protectedResourceMetadataUrls(parsed)) {
    doc = await fetchWellKnown(provider, candidate);
    if (doc) break;
  }
  if (!doc) {
    throw new McpOAuthDiscoveryError(
      provider,
      "no protected-resource metadata document found (RFC 9728)",
    );
  }

  const resource = readString(doc, "resource");
  const servers = readStringArray(doc, "authorization_servers");
  if (!servers || servers.length === 0) {
    throw new McpOAuthDiscoveryError(
      provider,
      "protected-resource metadata missing authorization_servers",
    );
  }
  for (const s of servers) assertHttpsUrl(provider, s, "authorization server issuer");

  const result: ProtectedResourceMetadata = {
    resource: resource ?? canonicalResourceUri(provider, resourceUrl),
    authorizationServers: servers,
  };
  cacheSet(prmCache, cacheKey, result);
  return result;
}

/**
 * RFC 8414 (with OIDC fallback) — resolve the authorization server's
 * endpoints from its issuer URL.
 */
export async function discoverAuthorizationServer(
  provider: string,
  issuer: string,
): Promise<AuthorizationServerMetadata> {
  const issuerUrl = assertHttpsUrl(provider, issuer, "authorization server issuer");
  const cacheKey = issuerUrl.toString();
  const cached = cacheGet(asCache, cacheKey);
  if (cached) return cached;

  let doc: Record<string, unknown> | null = null;
  for (const candidate of authorizationServerMetadataUrls(issuerUrl)) {
    doc = await fetchWellKnown(provider, candidate);
    if (doc) break;
  }
  if (!doc) {
    throw new McpOAuthDiscoveryError(
      provider,
      "no authorization-server metadata document found (RFC 8414 / OIDC)",
    );
  }

  const declaredIssuer = readString(doc, "issuer");
  // RFC 8414 §3.3 — the document must be about the issuer we asked for.
  // Compare with trailing-slash tolerance (issuers are commonly written
  // both ways) but nothing looser.
  const normalize = (s: string) => s.replace(/\/+$/, "");
  if (!declaredIssuer || normalize(declaredIssuer) !== normalize(issuerUrl.toString())) {
    throw new McpOAuthDiscoveryError(provider, "issuer mismatch in metadata");
  }

  const authorizationEndpoint = readString(doc, "authorization_endpoint");
  const tokenEndpoint = readString(doc, "token_endpoint");
  if (!authorizationEndpoint || !tokenEndpoint) {
    throw new McpOAuthDiscoveryError(
      provider,
      "metadata missing authorization_endpoint or token_endpoint",
    );
  }
  assertHttpsUrl(provider, authorizationEndpoint, "authorization_endpoint");
  assertHttpsUrl(provider, tokenEndpoint, "token_endpoint");

  // MCP requires PKCE S256. Absent advertisement → proceed (RFC 8414 makes
  // the field optional); advertised WITHOUT S256 → fail closed, never
  // downgrade to plain.
  const pkceMethods = readStringArray(doc, "code_challenge_methods_supported");
  if (pkceMethods !== null && !pkceMethods.includes("S256")) {
    throw new McpOAuthDiscoveryError(
      provider,
      "authorization server does not support PKCE S256",
    );
  }

  const registrationEndpoint = readString(doc, "registration_endpoint");
  if (registrationEndpoint) {
    assertHttpsUrl(provider, registrationEndpoint, "registration_endpoint");
  }
  const revocationEndpoint = readString(doc, "revocation_endpoint");
  if (revocationEndpoint) {
    assertHttpsUrl(provider, revocationEndpoint, "revocation_endpoint");
  }

  const result: AuthorizationServerMetadata = {
    issuer: declaredIssuer,
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint: registrationEndpoint ?? null,
    revocationEndpoint: revocationEndpoint ?? null,
    scopesSupported: readStringArray(doc, "scopes_supported"),
  };
  cacheSet(asCache, cacheKey, result);
  return result;
}

/**
 * Convenience composition: resource URL → its FIRST advertised authorization
 * server's metadata. Multi-AS resources are not differentiated in CS-1 (no
 * catalog server advertises more than one today); revisit if one appears.
 */
export async function discoverForResource(
  provider: string,
  resourceUrl: string,
): Promise<{
  resource: ProtectedResourceMetadata;
  authorizationServer: AuthorizationServerMetadata;
}> {
  const resource = await discoverProtectedResource(provider, resourceUrl);
  const authorizationServer = await discoverAuthorizationServer(
    provider,
    resource.authorizationServers[0]!,
  );
  return { resource, authorizationServer };
}
