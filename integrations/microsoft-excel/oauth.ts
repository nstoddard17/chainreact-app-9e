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
 * Microsoft Excel OAuth implementation.
 *
 * Fourth Microsoft consumer of `_shared/microsoft/oauth.ts` after
 * Outlook Mail (slice 6), Outlook Calendar (slice 7), and OneDrive
 * (slice 8). Shares all Microsoft OAuth wire-format via the helpers:
 *   - PKCE S256.
 *   - Multi-tenant `/common/` authorize + token endpoints.
 *   - Token exchange + refresh against
 *     `${MICROSOFT_TOKEN_BASE}/common/oauth2/v2.0/token`.
 *   - Refresh-token rotation/preserve-old policy.
 *
 * What's Excel-specific:
 *   - Redirect URL:
 *     /api/integrations/oauth/microsoft-excel/callback.
 *   - accountId resolution: Graph /me lookup via
 *     `_shared/microsoft/api/me.ts`; the `mail ?? userPrincipalName`
 *     fallback policy lives here so per-provider tests can assert it
 *     for Excel too.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL (for the redirect URL).
 *   - MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET (read inside the
 *     shared helper). Same Azure AD app id + secret as
 *     `microsoft-outlook`, `microsoft-outlook-calendar`, and
 *     `microsoft-onedrive`. Slice 15 deliberately does NOT introduce
 *     EXCEL_CLIENT_ID/SECRET — closes V1's separate-Azure-AD-app rot
 *     documented in slice 15 §"V1 rot to fix during port".
 *   - MICROSOFT_AUTHORIZE_BASE / MICROSOFT_TOKEN_BASE /
 *     MICROSOFT_GRAPH_API_BASE (e2e overrides, shared).
 *
 * `revoke()` is a stub deferred to the disconnect-UX slice (matches
 * every other Microsoft provider).
 */

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/microsoft-excel/callback`;
}

export const microsoftExcelOAuth: ProviderOAuth = {
  generatePkce: generateMicrosoftPkce,

  buildAuthUrl(state, scopes, pkce, _providerHint, steer) {
    if (pkce === null) {
      throw new Error(
        "microsoftExcelOAuth.buildAuthUrl: PKCE challenge is required for Microsoft Excel. The dispatcher should have generated one via generatePkce().",
      );
    }
    return buildMicrosoftAuthUrl({
      accountSteer: steer ?? null,
      state,
      scopes,
      pkceChallenge: pkce,
      redirectUrl: getRedirectUrl(),
    });
  },

  async handleCallback(code, _state, pkce) {
    if (pkce === null || !pkce.codeVerifier) {
      throw new Error(
        "microsoftExcelOAuth.handleCallback: PKCE code_verifier is required for Microsoft Excel; the consumed oauth_states row had none.",
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
