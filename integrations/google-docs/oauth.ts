import { type ProviderOAuth } from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import {
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
  generateGooglePkce,
  refreshGoogleToken,
} from "@/integrations/_shared/google/oauth";

/**
 * Google Docs OAuth implementation — Slice 3.GDOCS-2.
 *
 * Identical structure to `integrations/google-sheets/oauth.ts` and
 * `integrations/google-drive/oauth.ts` — every Google product reuses
 * the shared OAuth helpers at `_shared/google/oauth.ts`:
 *   - PKCE S256, access_type=offline, prompt=consent.
 *   - Token exchange + refresh against `oauth2.googleapis.com/token`.
 *   - Refresh-token rotation/preserve-old policy.
 *
 * What's Docs-specific:
 *   - Redirect URL: `/api/integrations/oauth/google-docs/callback`.
 *   - accountId lookup: OIDC userinfo (the `userinfo.email` scope
 *     grants it). Docs' own API doesn't expose a getProfile-like
 *     endpoint — the OIDC userinfo endpoint is the cleanest source of
 *     truth for the user's email; same pattern Sheets / Drive /
 *     Calendar / Gmail use. (The manifest requests `drive` +
 *     `userinfo.email` only; `documents` was retired as redundant —
 *     see the manifest scope comment.)
 *
 * Env vars read:
 *   - `NEXT_PUBLIC_APP_URL` — for the redirect URL.
 *   - `GOOGLE_USERINFO_BASE` — e2e override for the userinfo endpoint;
 *     defaults to `openidconnect.googleapis.com`.
 *   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — read inside the
 *     shared helper.
 *   - `GOOGLE_AUTHORIZE_BASE` / `GOOGLE_TOKEN_BASE` — e2e overrides,
 *     shared.
 *
 * `revoke` is a stub deferred to the disconnect-UX slice (matches
 * Gmail / Calendar / Drive / Sheets / Slack patterns).
 */

function googleUserinfoBase(): string {
  return (
    process.env.GOOGLE_USERINFO_BASE ?? "https://openidconnect.googleapis.com"
  );
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/google-docs/callback`;
}

interface GoogleUserinfo {
  email?: string;
  email_verified?: boolean;
  sub?: string;
  name?: string;
  picture?: string;
}

export const googleDocsOAuth: ProviderOAuth = {
  generatePkce: generateGooglePkce,

  buildAuthUrl(state, scopes, pkce, _providerHint, steer) {
    if (pkce === null) {
      throw new Error(
        "googleDocsOAuth.buildAuthUrl: PKCE challenge is required for Google Docs. The dispatcher should have generated one via generatePkce().",
      );
    }
    return buildGoogleAuthUrl({
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
        "googleDocsOAuth.handleCallback: PKCE code_verifier is required for Google Docs; the consumed oauth_states row had none.",
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
    // Deferred to disconnect-UX slice (matches Gmail / Calendar /
    // Drive / Sheets / Slack patterns).
  },
};
