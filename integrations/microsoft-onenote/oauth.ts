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
 * Microsoft OneNote OAuth implementation — Slice 3.ONENOTE-2.
 *
 * Sibling to `microsoft-outlook`, `microsoft-outlook-calendar`,
 * `microsoft-onedrive`, `microsoft-excel`, `microsoft-teams`. Shares
 * all Microsoft OAuth wire-format via
 * `integrations/_shared/microsoft/oauth.ts`:
 *   - PKCE S256.
 *   - Multi-tenant `/common/` authorize + token endpoints.
 *   - Token exchange and refresh against
 *     `${MICROSOFT_TOKEN_BASE}/common/oauth2/v2.0/token`.
 *   - Refresh-token rotation / preserve-old policy.
 *
 * What's OneNote-specific:
 *   - Redirect URL:
 *     /api/integrations/oauth/microsoft-onenote/callback.
 *   - accountId resolution: Graph /me lookup via
 *     `_shared/microsoft/api/me.ts`; the `mail ?? userPrincipalName`
 *     fallback policy lives here so per-provider tests can assert it.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL (for the redirect URL).
 *   - MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET (read inside the
 *     shared helper). Same Azure AD app id + secret as every
 *     Microsoft sibling — Slice ONENOTE-2 deliberately does NOT
 *     introduce ONENOTE_CLIENT_ID/SECRET.
 *   - MICROSOFT_AUTHORIZE_BASE / MICROSOFT_TOKEN_BASE /
 *     MICROSOFT_GRAPH_API_BASE (e2e overrides, shared).
 *
 * `revoke()` is a stub deferred to the disconnect-UX slice (matches
 * every Microsoft + Google sibling).
 */

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/microsoft-onenote/callback`;
}

export const microsoftOneNoteOAuth: ProviderOAuth = {
  generatePkce: generateMicrosoftPkce,

  buildAuthUrl(state, scopes, pkce) {
    if (pkce === null) {
      throw new Error(
        "microsoftOneNoteOAuth.buildAuthUrl: PKCE challenge is required for Microsoft OneNote. The dispatcher should have generated one via generatePkce().",
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
        "microsoftOneNoteOAuth.handleCallback: PKCE code_verifier is required for Microsoft OneNote; the consumed oauth_states row had none.",
      );
    }

    const tokens = await exchangeMicrosoftAuthCode({
      code,
      codeVerifier: pkce.codeVerifier,
      redirectUrl: getRedirectUrl(),
    });

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
    // Deferred to disconnect-UX slice (matches every Microsoft +
    // Google sibling).
  },
};
