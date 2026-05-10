import { type ProviderOAuth } from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import { getMe } from "@/integrations/_shared/microsoft/api/me";
import {
  buildMicrosoftAuthUrl,
  exchangeMicrosoftAuthCode,
  generateMicrosoftPkce,
  refreshMicrosoftToken,
} from "@/integrations/_shared/microsoft/oauth";

/**
 * Microsoft Teams OAuth implementation.
 *
 * Fifth Microsoft consumer of `_shared/microsoft/oauth.ts` after
 * Outlook Mail (slice 6), Outlook Calendar (slice 7), OneDrive
 * (slice 8), and Excel (slice 15). Shares all Microsoft OAuth
 * wire-format via the helpers:
 *   - PKCE S256.
 *   - Multi-tenant `/common/` authorize + token endpoints.
 *   - Token exchange + refresh against
 *     `${MICROSOFT_TOKEN_BASE}/common/oauth2/v2.0/token`.
 *   - Refresh-token rotation/preserve-old policy.
 *
 * What's Teams-specific:
 *   - Redirect URL:
 *     `/api/integrations/oauth/microsoft-teams/callback`.
 *   - accountId resolution: Graph /me lookup via
 *     `_shared/microsoft/api/me.ts`; the `mail ?? userPrincipalName`
 *     fallback policy applies here too.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL (for the redirect URL).
 *   - MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET (read inside the
 *     shared helper). Same Azure AD app id + secret as every other
 *     V2 Microsoft provider. Slice 16 deliberately does NOT introduce
 *     `TEAMS_CLIENT_ID/SECRET` — closes V1's separate-Azure-AD-app rot
 *     documented in slice 16 §"V1 rot to fix during port".
 *   - MICROSOFT_AUTHORIZE_BASE / MICROSOFT_TOKEN_BASE /
 *     MICROSOFT_GRAPH_API_BASE (e2e overrides, shared).
 *   - NO `TEAMS_TENANT_ID`. Batch 1 is 100% delegated-user; no
 *     app-only (`client_credentials`) flow.
 *
 * `revoke()` is a stub deferred to the disconnect-UX slice (matches
 * every other Microsoft provider).
 */

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/microsoft-teams/callback`;
}

export const microsoftTeamsOAuth: ProviderOAuth = {
  generatePkce: generateMicrosoftPkce,

  buildAuthUrl(state, scopes, pkce) {
    if (pkce === null) {
      throw new Error(
        "microsoftTeamsOAuth.buildAuthUrl: PKCE challenge is required for Microsoft Teams. The dispatcher should have generated one via generatePkce().",
      );
    }
    return buildMicrosoftAuthUrl({
      state,
      scopes,
      pkceChallenge: pkce,
      redirectUrl: getRedirectUrl(),
    });
  },

  async handleCallback(code, _state, pkce) {
    if (pkce === null || !pkce.codeVerifier) {
      throw new Error(
        "microsoftTeamsOAuth.handleCallback: PKCE code_verifier is required for Microsoft Teams; the consumed oauth_states row had none.",
      );
    }

    const tokens = await exchangeMicrosoftAuthCode({
      code,
      codeVerifier: pkce.codeVerifier,
      redirectUrl: getRedirectUrl(),
    });

    // Resolve the connected account's email via Graph /me.
    const me = await getMe(tokens.accessToken);
    // Personal accounts can return mail: null; fall back to UPN.
    const email = me.mail ?? me.userPrincipalName;
    if (!email) {
      throw new Error(
        "Microsoft Graph /me response missing both mail and userPrincipalName.",
      );
    }

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(tokens.accessToken),
        refreshTokenEncrypted: encryptToken(tokens.refreshToken),
        accessTokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopesGranted,
      },
      account: {
        providerAccountId: email,
        displayName: email,
        metadata: {
          email,
          graphId: me.id ?? null,
          mailField: me.mail ? "mail" : "userPrincipalName",
        },
      },
    };
  },

  refreshToken: refreshMicrosoftToken,

  async revoke(_token: string): Promise<void> {
    // Deferred to disconnect-UX slice (matches every Microsoft provider).
  },
};
