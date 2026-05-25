import { type ProviderOAuth } from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import {
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
  generateGooglePkce,
  refreshGoogleToken,
} from "@/integrations/_shared/google/oauth";

/**
 * Google Calendar OAuth implementation.
 *
 * Shares all Google OAuth wire-format with Gmail via
 * `integrations/_shared/google/oauth.ts`:
 *   - PKCE S256, access_type=offline, prompt=consent.
 *   - Token exchange + refresh against `oauth2.googleapis.com/token`.
 *   - Refresh-token rotation/preserve-old policy.
 *
 * What's Calendar-specific:
 *   - Redirect URL: /api/integrations/oauth/google-calendar/callback.
 *   - accountId lookup: OIDC userinfo (the `userinfo.email` scope grants it).
 *     Calendar's own API doesn't expose a thin getProfile-like endpoint that
 *     works with the narrow `calendar.events` scope, so the userinfo
 *     endpoint is the cleanest source of truth for the user's email.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL (for the redirect URL).
 *   - GOOGLE_USERINFO_BASE (e2e override for the userinfo endpoint;
 *     defaults to openidconnect.googleapis.com).
 *   - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (read inside the shared helper).
 *   - GOOGLE_AUTHORIZE_BASE / GOOGLE_TOKEN_BASE (e2e overrides, shared).
 *
 * revoke is a stub deferred to the disconnect-UX slice (matches Gmail/Slack).
 */

function googleUserinfoBase(): string {
  return (
    process.env.GOOGLE_USERINFO_BASE ?? "https://openidconnect.googleapis.com"
  );
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/google-calendar/callback`;
}

interface GoogleUserinfo {
  email?: string;
  email_verified?: boolean;
  sub?: string;
  name?: string;
  picture?: string;
}

export const googleCalendarOAuth: ProviderOAuth = {
  generatePkce: generateGooglePkce,

  buildAuthUrl(state, scopes, pkce) {
    if (pkce === null) {
      throw new Error(
        "googleCalendarOAuth.buildAuthUrl: PKCE challenge is required for Google Calendar. The dispatcher should have generated one via generatePkce().",
      );
    }
    return buildGoogleAuthUrl({
      state,
      scopes,
      pkceChallenge: pkce,
      redirectUrl: getRedirectUrl(),
    });
  },

  async handleCallback(code, _state, pkce) {
    if (pkce === null || !pkce.codeVerifier) {
      throw new Error(
        "googleCalendarOAuth.handleCallback: PKCE code_verifier is required for Google Calendar; the consumed oauth_states row had none.",
      );
    }

    const tokens = await exchangeGoogleAuthCode({
      code,
      codeVerifier: pkce.codeVerifier,
      redirectUrl: getRedirectUrl(),
    });

    // OIDC userinfo lookup — the userinfo.email scope grants this.
    const userinfoRes = await fetch(`${googleUserinfoBase()}/v1/userinfo`, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!userinfoRes.ok) {
      throw new Error(`Google userinfo failed: HTTP ${userinfoRes.status}`);
    }
    const userinfo = (await userinfoRes.json()) as GoogleUserinfo;
    if (!userinfo.email) {
      throw new Error("Google userinfo response missing email.");
    }

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(tokens.accessToken),
        refreshTokenEncrypted: encryptToken(tokens.refreshToken),
        accessTokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopesGranted,
      },
      account: {
        providerAccountId: userinfo.email,
        displayName: userinfo.email,
        metadata: {
          email: userinfo.email,
          sub: userinfo.sub ?? null,
          emailVerified: userinfo.email_verified ?? null,
        },
      },
    };
  },

  refreshToken: refreshGoogleToken,

  async revoke(_token: string): Promise<void> {
    // Deferred to disconnect-UX slice (matches Gmail + Slack patterns).
  },
};
