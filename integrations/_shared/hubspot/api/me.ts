/**
 * HubSpot account-info resolution helper.
 *
 * Slice 13 Commit 2. Mirrors the dual-endpoint strategy V1 uses at
 * [`provider-registry.ts:563-602`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L563):
 *
 *   - PRIMARY: `GET /oauth/v1/access-tokens/{accessToken}`. The token
 *     is in the URL path; no Authorization header needed (per HubSpot
 *     docs). Response: `{ user, user_id, hub_id, hub_domain, ... }`.
 *     This is the canonical hub-id resolution endpoint.
 *
 *   - FALLBACK: `GET /integrations/v1/me`. Authorization: Bearer.
 *     Response: `{ user, hubDomain, userId, portalId, ... }`. Used only
 *     when the access-tokens endpoint fails (e.g. transient 5xx, future
 *     deprecation).
 *
 * Returns the resolved hub identifier as a string (V1's hub_id /
 * portalId is numeric; V2 string-casts at the boundary so
 * `integrations.providerAccountId` stays a stable text column).
 *
 * Throws when both endpoints fail — callers (the OAuth handleCallback)
 * surface this as an OAuth-callback error.
 *
 * Env vars read:
 *   - HUBSPOT_API_BASE — e2e override (production never sets it; default
 *     is `https://api.hubapi.com`). The HubSpot API host is single-region;
 *     no per-tenant routing.
 */

const ACCESS_TOKEN_INFO_PATH = "/oauth/v1/access-tokens";
const INTEGRATIONS_ME_PATH = "/integrations/v1/me";

export function hubspotApiBase(): string {
  return process.env.HUBSPOT_API_BASE ?? "https://api.hubapi.com";
}

interface AccessTokenInfo {
  user?: string;
  user_id?: number;
  hub_id?: number | string;
  hub_domain?: string;
  scopes?: string[];
  expires_in?: number;
  app_id?: number;
  token_type?: string;
}

interface IntegrationsMeInfo {
  portalId?: number | string;
  userId?: number;
  user?: string;
  hubDomain?: string;
}

export interface HubSpotAccountInfo {
  /** Stringified hub_id / portalId. */
  hubId: string;
  /** Hub domain ("ChainReact Dev"-style label, may include "(Sandbox)"). */
  hubDomain: string | null;
  /** User email. */
  user: string | null;
  /** Numeric user id, stringified for stability. */
  userId: string | null;
  /**
   * Which endpoint resolved the info — useful for telemetry / debug.
   * `"primary"` = `/oauth/v1/access-tokens`, `"fallback"` = `/integrations/v1/me`.
   */
  source: "primary" | "fallback";
}

/**
 * Resolve the user's HubSpot portal/account info using the dual-endpoint
 * strategy. Tries primary first; on any failure (network, non-2xx,
 * malformed JSON) falls through to fallback.
 */
export async function resolveHubSpotAccount(
  accessToken: string,
): Promise<HubSpotAccountInfo> {
  if (!accessToken) {
    throw new Error("resolveHubSpotAccount: accessToken is required.");
  }

  // PRIMARY: /oauth/v1/access-tokens/{token}
  try {
    const url = `${hubspotApiBase()}${ACCESS_TOKEN_INFO_PATH}/${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, { method: "GET" });
    if (res.ok) {
      const json = (await res.json()) as AccessTokenInfo;
      const hubId =
        typeof json.hub_id === "number" || typeof json.hub_id === "string"
          ? String(json.hub_id)
          : null;
      if (hubId) {
        return {
          hubId,
          hubDomain: json.hub_domain ?? null,
          user: json.user ?? null,
          userId:
            typeof json.user_id === "number" ? String(json.user_id) : null,
          source: "primary",
        };
      }
    }
    // Falls through on non-2xx OR on a 200 missing hub_id — both are
    // unexpected per HubSpot docs but we'd rather try the fallback than
    // fail the OAuth callback.
  } catch {
    // network / parse error — falls through to fallback
  }

  // FALLBACK: /integrations/v1/me with Bearer auth.
  const url = `${hubspotApiBase()}${INTEGRATIONS_ME_PATH}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(
      `HubSpot account resolution failed: both /oauth/v1/access-tokens and /integrations/v1/me returned non-2xx (last status: ${res.status}).`,
    );
  }
  const json = (await res.json()) as IntegrationsMeInfo;
  const hubId =
    typeof json.portalId === "number" || typeof json.portalId === "string"
      ? String(json.portalId)
      : null;
  if (!hubId) {
    throw new Error(
      "HubSpot account resolution failed: /integrations/v1/me response missing portalId.",
    );
  }
  return {
    hubId,
    hubDomain: json.hubDomain ?? null,
    user: json.user ?? null,
    userId: typeof json.userId === "number" ? String(json.userId) : null,
    source: "fallback",
  };
}
