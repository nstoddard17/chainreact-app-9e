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
 * Microsoft OneDrive OAuth implementation.
 *
 * Sibling to `microsoft-outlook` (Slice 6 mail) and
 * `microsoft-outlook-calendar` (Slice 7). Shares all Microsoft OAuth
 * wire-format via `integrations/_shared/microsoft/oauth.ts`:
 *   - PKCE S256.
 *   - Multi-tenant `/common/` authorize + token endpoints.
 *   - Token exchange and refresh against
 *     `${MICROSOFT_TOKEN_BASE}/common/oauth2/v2.0/token`.
 *   - Refresh-token rotation/preserve-old policy.
 *
 * What's OneDrive-specific:
 *   - Redirect URL:
 *     /api/integrations/oauth/microsoft-onedrive/callback.
 *   - accountId resolution: Graph /me lookup via
 *     `_shared/microsoft/api/me.ts`; the `mail ?? userPrincipalName`
 *     fallback policy lives here so per-provider tests can assert it.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL (for the redirect URL).
 *   - MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET (read inside the
 *     shared helper). Same Azure AD app id + secret as
 *     `microsoft-outlook` and `microsoft-outlook-calendar` — Slice 8
 *     deliberately does NOT introduce ONEDRIVE_CLIENT_ID/SECRET.
 *   - MICROSOFT_AUTHORIZE_BASE / MICROSOFT_TOKEN_BASE /
 *     MICROSOFT_GRAPH_API_BASE (e2e overrides, shared).
 *
 * `revoke()` is a stub deferred to the disconnect-UX slice (matches
 * Gmail / Calendar / Drive / Sheets / Slack / Slice 6 mail / Slice 7
 * calendar patterns).
 */

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/microsoft-onedrive/callback`;
}

export const microsoftOneDriveOAuth: ProviderOAuth = {
  generatePkce: generateMicrosoftPkce,

  buildAuthUrl(state, scopes, pkce) {
    if (pkce === null) {
      throw new Error(
        "microsoftOneDriveOAuth.buildAuthUrl: PKCE challenge is required for Microsoft OneDrive. The dispatcher should have generated one via generatePkce().",
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
        "microsoftOneDriveOAuth.handleCallback: PKCE code_verifier is required for Microsoft OneDrive; the consumed oauth_states row had none.",
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
          // graphId is the Azure object id (immutable GUID). Stored for
          // downstream API wrappers that need the stable handle.
          graphId: me.id ?? null,
          // Capture which field we resolved from so future debugging /
          // analytics can distinguish work-school accounts (mail set)
          // from consumer accounts (mail null, UPN used).
          mailField: me.mail ? "mail" : "userPrincipalName",
        },
      },
    };
  },

  refreshToken: refreshMicrosoftToken,

  async revoke(_token: string): Promise<void> {
    // Deferred to disconnect-UX slice (matches Gmail / Calendar / Drive /
    // Sheets / Slack / Slice 6 mail / Slice 7 calendar patterns).
  },
};
