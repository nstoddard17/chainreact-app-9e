import type { AnyProviderOAuth, ProviderAccountInfo } from "@/contracts/integration";
import {
  createMcpProviderOAuth,
  type McpOAuthTokenResponse,
} from "@/integrations/_shared/mcp/oauth";

/**
 * Linear OAuth implementation — CS-1 MCP-AUTH (first MCP-catalog connection).
 *
 * FIRST CONSUMER of the shared MCP OAuth helper
 * (`integrations/_shared/mcp/oauth.ts`), in `static` endpoint mode.
 *
 * Why static mode and not `discovered` (live-verified 2026-07-22/23, see
 * docs/providers/linear/research.md):
 *   - Linear's MCP server (`https://mcp.linear.app/mcp`, Streamable HTTP) DOES
 *     publish RFC 9728 protected-resource metadata + an RFC 8414 AS at
 *     `https://mcp.linear.app` (PKCE S256-only, open anonymous DCR, public
 *     clients allowed) — the helper's `discovered` mode exists for exactly
 *     this shape.
 *   - BUT Linear's own docs (linear.app/docs/mcp) document the supported path
 *     for an EXISTING server-side OAuth application: run the REGULAR Linear
 *     OAuth flow (`https://linear.app/oauth/authorize` +
 *     `https://api.linear.app/oauth/token`, static app from
 *     linear.app/settings/api/applications) and send the resulting access
 *     token as `Authorization: Bearer …` to the MCP server — "without an
 *     extra authentication hop". Whether static app credentials are accepted
 *     by the MCP AS is UNVERIFIED; the regular path is fully documented,
 *     gives GraphQL identity access (`viewer`), and yields a token valid for
 *     BOTH api.linear.app and mcp.linear.app. The approved architecture plan
 *     (§4.2) prefers static vendor-dashboard registration where it exists —
 *     this is that branch.
 *
 * Wire format (verified against linear.app/developers/oauth-2-0-authentication,
 * fetched 2026-07-22):
 *   - Authorize: GET `https://linear.app/oauth/authorize?client_id=…&
 *     redirect_uri=…&response_type=code&scope=read,write&state=…&
 *     code_challenge=…&code_challenge_method=S256` — scopes are
 *     COMMA-separated; PKCE `plain`/`S256` supported, V2 always sends S256.
 *   - Token: POST `https://api.linear.app/oauth/token` (form-encoded,
 *     body-auth client credentials) → `{ access_token, refresh_token,
 *     expires_in: 86400, scope, token_type: "Bearer" }`.
 *   - TOKEN LIFETIMES CHANGED 2026-04-01 ("All OAuth2 applications were
 *     migrated to the new refresh token system"): access tokens live 24h;
 *     refresh tokens are issued ALWAYS and ROTATE ON EVERY USE (30-minute
 *     replay grace window). `requireRefreshToken: true` — a response without
 *     one would strand the row inside a day. The shared helper's
 *     rotate-or-preserve policy persists each rotated token; the dispatcher's
 *     single-flight refresh lock + cross-instance refreshWithClaim prevent
 *     rotation races.
 *   - Refresh: POST the same token endpoint with `grant_type=refresh_token`.
 *     RFC 6749 §5.2 `invalid_grant` → RefreshAuthRequiredError (helper) →
 *     needs_reconnect_at marking (dispatcher, V2-READY-32).
 *   - Revoke: POST `https://api.linear.app/oauth/revoke` (documented; the
 *     helper sends RFC 7009 form shape, which matches).
 *   - RFC 8707 `resource` param: NOT sent — undocumented on Linear's regular
 *     AS. (The MCP AS advertises `resource: https://mcp.linear.app/mcp`; if a
 *     future slice moves Linear to `discovered` mode the helper sends it
 *     automatically.)
 *
 * Identity: POST `https://api.linear.app/graphql` `{ viewer { id name email } }`
 * with the fresh Bearer. `providerAccountId` = viewer.id (stable UUID — emails
 * can change); displayName = name → email → id.
 *
 * Env vars read:
 *   - LINEAR_CLIENT_ID / LINEAR_CLIENT_SECRET — from the Linear workspace
 *     OAuth application (see docs/providers/linear/owner-setup.md).
 *   - NEXT_PUBLIC_APP_URL — base for the OAuth callback URL.
 *   - LINEAR_AUTHORIZE_BASE / LINEAR_TOKEN_BASE / LINEAR_API_BASE — e2e mock
 *     overrides only; production never sets these.
 */

function linearAuthorizeBase(): string {
  return process.env.LINEAR_AUTHORIZE_BASE ?? "https://linear.app";
}

function linearTokenBase(): string {
  return process.env.LINEAR_TOKEN_BASE ?? "https://api.linear.app";
}

function linearApiBase(): string {
  return process.env.LINEAR_API_BASE ?? "https://api.linear.app";
}

function getClientId(): string {
  const id = process.env.LINEAR_CLIENT_ID;
  if (!id) throw new Error("LINEAR_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.LINEAR_CLIENT_SECRET;
  if (!secret) throw new Error("LINEAR_CLIENT_SECRET env var is not set.");
  return secret;
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/linear/callback`;
}

interface LinearViewerResponse {
  data?: {
    viewer?: {
      id?: string;
      name?: string | null;
      email?: string | null;
    } | null;
  } | null;
}

async function resolveLinearAccount(input: {
  accessToken: string;
  tokenResponse: McpOAuthTokenResponse;
}): Promise<ProviderAccountInfo> {
  const res = await fetch(`${linearApiBase()}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query: "{ viewer { id name email } }" }),
  });
  if (!res.ok) {
    throw new Error(`Linear viewer lookup failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as LinearViewerResponse;
  const viewer = json.data?.viewer;
  if (!viewer?.id) {
    throw new Error("Linear viewer response missing id.");
  }
  return {
    // Stable user UUID — emails can change; ids cannot. One row per Linear
    // user per V2 account (tokenScope: "user").
    providerAccountId: viewer.id,
    displayName: viewer.name ?? viewer.email ?? viewer.id,
    metadata: {
      linearUserId: viewer.id,
      email: viewer.email ?? null,
      name: viewer.name ?? null,
    },
  };
}

export const linearOAuth: AnyProviderOAuth = createMcpProviderOAuth({
  provider: "linear",
  endpoints: {
    kind: "static",
    authorizationEndpoint: () => `${linearAuthorizeBase()}/oauth/authorize`,
    tokenEndpoint: () => `${linearTokenBase()}/oauth/token`,
    revocationEndpoint: () => `${linearTokenBase()}/oauth/revoke`,
    // No RFC 8707 resource on Linear's regular AS (undocumented there).
  },
  clientId: getClientId,
  clientSecret: getClientSecret,
  redirectUri: getRedirectUrl,
  // Linear's authorize endpoint takes COMMA-separated scopes.
  scopeSeparator: ",",
  requireRefreshToken: true,
  resolveAccount: resolveLinearAccount,
});
