/**
 * Shared MCP OAuth 2.1 helper — CS-1 of
 * docs/slices/phase-5/mcp-integration-layer-architecture-plan.md.
 *
 * `createMcpProviderOAuth(config)` returns a standard `ProviderOAuth` object
 * that plugs into the EXISTING OAuth dispatcher/registries exactly like every
 * hand-written provider implementation. This is deliberately NOT a parallel
 * auth system: state issuance/consumption, encrypted token storage
 * (`repositories/integrations.upsertActive` via the dispatcher), the refresh
 * lock, `refreshAndRetry`, and the reconnect flow are all untouched — this
 * module only standardizes the provider-side wire mechanics that every
 * MCP-catalog app shares:
 *
 *   - PKCE S256 (always on — MCP requires it; OAuth 2.1 baseline).
 *   - Endpoint resolution, in one of two per-provider modes:
 *       • `discovered` — RFC 9728 Protected Resource Metadata → RFC 8414
 *         Authorization Server Metadata (see `./oauthDiscovery.ts`), with the
 *         RFC 8707 `resource` parameter sent on authorize / token / refresh.
 *         For vendors whose MCP server is fronted by its own authorization
 *         server (e.g. `mcp.linear.app`'s AS, `mcp.notion.com`, …).
 *       • `static` — vendor-documented fixed endpoints from the provider's
 *         module (env-overridable for e2e). For vendors whose documented
 *         path for existing server-side OAuth apps is their REGULAR
 *         authorization server, with the issued token accepted as a Bearer
 *         by the MCP server (Linear documents exactly this).
 *   - Authorization-code exchange + refresh with the repo's standard
 *     policies: body-auth client credentials (public clients omit the
 *     secret and rely on PKCE), rotate-or-preserve refresh tokens,
 *     RFC 6749 §5.2 `invalid_grant` → `RefreshAuthRequiredError` so the
 *     dispatcher marks needs-reconnect exactly once (V2-READY-32).
 *   - Best-effort RFC 7009 revocation when an endpoint is known.
 *
 * NO-LEAK: token material is encrypted immediately via
 * `core/encryption/tokens` and never logged; error messages carry only the
 * provider slug + a bare OAuth2 error code or HTTP status — never response
 * bodies, tokens, or identities. Timeouts bound every outbound call.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  type AnyProviderOAuth,
  type EncryptedTokens,
  type PkceGeneration,
  type ProviderAccountInfo,
  RefreshAuthRequiredError,
  isRefreshAuthRequiredCode,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import {
  assertHttpsUrl,
  canonicalResourceUri,
  discoverForResource,
} from "./oauthDiscovery";

const TOKEN_REQUEST_TIMEOUT_MS = 20_000;

// ─── Config ──────────────────────────────────────────────────────────────────

/**
 * Endpoint resolution strategy. Functions (not values) so env overrides are
 * read per call, matching the `*_BASE` convention across `integrations/`.
 */
export type McpOAuthEndpoints =
  | {
      readonly kind: "discovered";
      /** Canonical MCP server URL — the RFC 9728 protected resource. */
      readonly resourceUrl: () => string;
    }
  | {
      readonly kind: "static";
      readonly authorizationEndpoint: () => string;
      readonly tokenEndpoint: () => string;
      /** RFC 7009 endpoint when the vendor documents one; null → revoke no-ops. */
      readonly revocationEndpoint?: (() => string) | null;
      /**
       * Optional RFC 8707 resource to bind tokens to. Most static-mode
       * vendors (Linear's regular AS) don't document the parameter — leave
       * unset to omit it entirely.
       */
      readonly resource?: (() => string) | null;
    };

/** Raw (already-JSON-parsed) OAuth2 token endpoint success response. */
export interface McpOAuthTokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly expires_in?: number;
  readonly scope?: string;
  readonly token_type?: string;
  /** Present when the AS honored an `openid` scope request. */
  readonly id_token?: string;
}

export interface McpProviderOAuthConfig {
  /** Provider slug — used ONLY for error messages and typed errors. */
  readonly provider: string;
  readonly endpoints: McpOAuthEndpoints;
  readonly clientId: () => string;
  /**
   * Confidential clients supply the secret (sent body-auth, the repo's
   * common shape). Public clients (PKCE-only, `token_endpoint_auth_method:
   * "none"`) omit this entirely.
   */
  readonly clientSecret?: (() => string) | null;
  readonly redirectUri: () => string;
  /** Scope join character for the authorize URL. Default " "; Linear uses ",". */
  readonly scopeSeparator?: string;
  /**
   * When true, a callback token response WITHOUT a refresh_token fails the
   * connect instead of persisting a row that will strand when the access
   * token expires (Linear: 24h tokens + mandatory rotating refresh).
   */
  readonly requireRefreshToken: boolean;
  /**
   * Connect-time identity resolution — provider-specific by nature (there is
   * no MCP-standard "who am I"). Receives the PLAINTEXT access token (never
   * store it; the caller encrypts) plus the raw token response (some ASes
   * embed identity, e.g. an OIDC id_token).
   */
  readonly resolveAccount: (input: {
    accessToken: string;
    tokenResponse: McpOAuthTokenResponse;
  }) => Promise<ProviderAccountInfo>;
}

// ─── Internals ───────────────────────────────────────────────────────────────

/**
 * 32 random bytes → ~43-char base64url verifier (RFC 7636 §4.1 minimum),
 * S256 challenge. Identical to the airtable/gmail/asana generators.
 */
function generatePkce(): PkceGeneration {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
}

/**
 * Extract a SAFE error code from a failed token-endpoint response: the bare
 * OAuth2 `error` code when the body is standard JSON, else `HTTP <status>`.
 * Never returns body prose beyond the standardized code fields.
 */
async function readOAuthErrorCode(res: Response): Promise<string> {
  try {
    const text = await res.text();
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.length > 0) {
      return parsed.error;
    }
  } catch {
    // not JSON / unreadable — fall through to the status form.
  }
  return `HTTP ${res.status}`;
}

interface ResolvedEndpoints {
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly revocationEndpoint: string | null;
  /** RFC 8707 resource to send, or null to omit the parameter. */
  readonly resource: string | null;
}

async function resolveEndpoints(config: McpProviderOAuthConfig): Promise<ResolvedEndpoints> {
  const { endpoints, provider } = config;
  if (endpoints.kind === "static") {
    const authorizationEndpoint = endpoints.authorizationEndpoint();
    const tokenEndpoint = endpoints.tokenEndpoint();
    assertHttpsUrl(provider, authorizationEndpoint, "authorization endpoint");
    assertHttpsUrl(provider, tokenEndpoint, "token endpoint");
    const revocationEndpoint = endpoints.revocationEndpoint?.() ?? null;
    if (revocationEndpoint) assertHttpsUrl(provider, revocationEndpoint, "revocation endpoint");
    const resourceRaw = endpoints.resource?.() ?? null;
    return {
      authorizationEndpoint,
      tokenEndpoint,
      revocationEndpoint,
      resource: resourceRaw ? canonicalResourceUri(provider, resourceRaw) : null,
    };
  }
  // Discovered mode — RFC 9728 → RFC 8414 (cached in oauthDiscovery).
  const { authorizationServer, resource } = await discoverForResource(
    provider,
    endpoints.resourceUrl(),
  );
  return {
    authorizationEndpoint: authorizationServer.authorizationEndpoint,
    tokenEndpoint: authorizationServer.tokenEndpoint,
    revocationEndpoint: authorizationServer.revocationEndpoint,
    // Prefer the resource identifier the PRM document itself declares.
    resource: canonicalResourceUri(config.provider, resource.resource),
  };
}

async function postForm(
  provider: string,
  url: string,
  params: URLSearchParams,
  what: string,
): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Network/timeout — no response object exists; keep the reason generic
    // (never echo the URL's query material or any request body).
    throw new Error(`${provider} ${what} request failed (network/timeout).`);
  }
}

function parseTokenSuccess(provider: string, raw: unknown, what: string): McpOAuthTokenResponse {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${provider} ${what} response is not a JSON object.`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.access_token !== "string" || obj.access_token.length === 0) {
    throw new Error(`${provider} ${what} response missing access_token.`);
  }
  return obj as unknown as McpOAuthTokenResponse;
}

/** Split a token-response scope echo on spaces and/or commas. */
function parseScopeEcho(scope: string | undefined): readonly string[] {
  if (!scope) return [];
  return scope.split(/[\s,]+/).filter((s) => s.length > 0);
}

function toEncryptedTokens(
  json: McpOAuthTokenResponse,
  refreshTokenToPersist: string | null,
): EncryptedTokens {
  return {
    accessTokenEncrypted: encryptToken(json.access_token),
    refreshTokenEncrypted:
      refreshTokenToPersist !== null ? encryptToken(refreshTokenToPersist) : null,
    accessTokenExpiresAt:
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null,
    scopes: parseScopeEcho(json.scope),
  };
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createMcpProviderOAuth(config: McpProviderOAuthConfig): AnyProviderOAuth {
  const scopeSeparator = config.scopeSeparator ?? " ";

  return {
    generatePkce,

    buildAuthUrl(state, scopes, pkce): string | Promise<string> {
      if (pkce === null) {
        // Should be impossible — the dispatcher always threads PKCE because
        // generatePkce is declared. Defensive throw mirrors airtable/gmail/asana.
        throw new Error(
          `${config.provider} MCP OAuth: PKCE challenge is required. The dispatcher should have generated one via generatePkce().`,
        );
      }
      const build = (resolved: Pick<ResolvedEndpoints, "authorizationEndpoint" | "resource">): string => {
        const params = new URLSearchParams({
          client_id: config.clientId(),
          redirect_uri: config.redirectUri(),
          response_type: "code",
          scope: scopes.join(scopeSeparator),
          state,
          code_challenge: pkce.codeChallenge,
          code_challenge_method: pkce.codeChallengeMethod,
        });
        if (resolved.resource) params.set("resource", resolved.resource);
        const joiner = resolved.authorizationEndpoint.includes("?") ? "&" : "?";
        return `${resolved.authorizationEndpoint}${joiner}${params.toString()}`;
      };
      // Static mode stays synchronous (no network — keeps existing sync-flow
      // expectations intact); discovered mode returns a promise the
      // dispatcher awaits (contract widened in CS-1).
      if (config.endpoints.kind === "static") {
        const authorizationEndpoint = config.endpoints.authorizationEndpoint();
        assertHttpsUrl(config.provider, authorizationEndpoint, "authorization endpoint");
        const resourceRaw = config.endpoints.resource?.() ?? null;
        return build({
          authorizationEndpoint,
          resource: resourceRaw
            ? canonicalResourceUri(config.provider, resourceRaw)
            : null,
        });
      }
      return resolveEndpoints(config).then(build);
    },

    async handleCallback(code, _state, pkce) {
      if (pkce === null || !pkce.codeVerifier) {
        throw new Error(
          `${config.provider} MCP OAuth: missing PKCE code_verifier from the state row. Refusing the token exchange.`,
        );
      }
      const resolved = await resolveEndpoints(config);
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId(),
        redirect_uri: config.redirectUri(),
        code,
        code_verifier: pkce.codeVerifier,
      });
      const secret = config.clientSecret?.();
      if (secret) params.set("client_secret", secret);
      if (resolved.resource) params.set("resource", resolved.resource);

      const res = await postForm(config.provider, resolved.tokenEndpoint, params, "token exchange");
      if (!res.ok) {
        throw new Error(
          `${config.provider} token exchange failed: ${await readOAuthErrorCode(res)}`,
        );
      }
      const json = parseTokenSuccess(config.provider, await res.json(), "token");
      if (config.requireRefreshToken && !json.refresh_token) {
        // Short-lived access tokens without a refresh token would strand the
        // row before it's ever useful — fail the connect instead (asana
        // precedent; Linear issues 24h tokens with mandatory rotation).
        throw new Error(`${config.provider} token response missing refresh_token.`);
      }

      const account = await config.resolveAccount({
        accessToken: json.access_token,
        tokenResponse: json,
      });

      return {
        tokens: toEncryptedTokens(json, json.refresh_token ?? null),
        account,
      };
    },

    async refreshToken(refreshTokenPlaintext): Promise<EncryptedTokens> {
      const resolved = await resolveEndpoints(config);
      const params = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: config.clientId(),
        refresh_token: refreshTokenPlaintext,
      });
      const secret = config.clientSecret?.();
      if (secret) params.set("client_secret", secret);
      if (resolved.resource) params.set("resource", resolved.resource);

      const res = await postForm(config.provider, resolved.tokenEndpoint, params, "token refresh");
      if (!res.ok) {
        const code = await readOAuthErrorCode(res);
        if (isRefreshAuthRequiredCode(code)) {
          // Dead grant (revoked / rotated-away / consent withdrawn) — the
          // dispatcher marks needs-reconnect once and re-throws (V2-READY-32).
          throw new RefreshAuthRequiredError(config.provider, code);
        }
        throw new Error(`${config.provider} token refresh failed: ${code}`);
      }
      const json = parseTokenSuccess(config.provider, await res.json(), "refresh");
      // Rotate-or-preserve: persist a rotated refresh token when the AS
      // returns one (OAuth 2.1 rotation, Linear rotates on every use), else
      // keep the original (HubSpot/Monday/Asana preservation contract).
      return toEncryptedTokens(json, json.refresh_token ?? refreshTokenPlaintext);
    },

    async revoke(token: string): Promise<void> {
      // Best-effort RFC 7009. Static mode uses the configured endpoint;
      // discovered mode uses the AS metadata's advertisement. No endpoint →
      // nothing to do (matches the repo-wide revoke posture). Errors
      // propagate — the purge service owns best-effort/retry policy.
      let revocationEndpoint: string | null = null;
      if (config.endpoints.kind === "static") {
        revocationEndpoint = config.endpoints.revocationEndpoint?.() ?? null;
        if (revocationEndpoint) {
          assertHttpsUrl(config.provider, revocationEndpoint, "revocation endpoint");
        }
      } else {
        revocationEndpoint = (await resolveEndpoints(config)).revocationEndpoint;
      }
      if (!revocationEndpoint) return;

      const params = new URLSearchParams({
        token,
        client_id: config.clientId(),
      });
      const secret = config.clientSecret?.();
      if (secret) params.set("client_secret", secret);
      const res = await postForm(config.provider, revocationEndpoint, params, "token revocation");
      // RFC 7009: 200 means revoked-or-already-invalid. Anything else is a
      // real failure the purge flow should see (status only — no body).
      if (!res.ok) {
        throw new Error(`${config.provider} token revocation failed: HTTP ${res.status}`);
      }
    },
  };
}
