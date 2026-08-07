import { type ProviderOAuth } from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import {
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
  generateGooglePkce,
  refreshGoogleToken,
} from "@/integrations/_shared/google/oauth";

/**
 * Gmail OAuth implementation.
 *
 * Per docs/rules/oauth-dispatcher.md and the Slice 2 plan:
 *   - PKCE S256, access_type=offline, prompt=consent, refresh-token
 *     rotation/preserve-old policy — all live in
 *     `integrations/_shared/google/oauth.ts` (shared with Google Calendar
 *     and future Drive/Docs/Sheets ports).
 *   - This module is the Gmail-specific shell:
 *       * the `/api/integrations/oauth/gmail/callback` redirect URL,
 *       * the accountId lookup against `users.getProfile` (authorized
 *         by the gmail.modify scope we request).
 *   - revoke is a stub deferred to the disconnect-UX slice (matches
 *     Slack's pattern for the same parent decision).
 */

/**
 * Gmail-specific API base override; only Gmail uses
 * gmail.googleapis.com/v1/users/me/profile to fetch the connected
 * emailAddress, so this stays here rather than in the shared helper.
 */
function gmailApiBase(): string {
  return process.env.GMAIL_API_BASE ?? "https://gmail.googleapis.com";
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/gmail/callback`;
}

interface GmailUserProfile {
  emailAddress: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId?: string;
}

export const gmailOAuth: ProviderOAuth = {
  generatePkce: generateGooglePkce,

  buildAuthUrl(state, scopes, pkce, _providerHint, steer) {
    if (pkce === null) {
      // Should be impossible — the dispatcher always passes PKCE for
      // Gmail because generatePkce returned a non-null value. Defensive
      // throw so a future refactor that breaks the connect-time threading
      // surfaces immediately.
      throw new Error(
        "gmailOAuth.buildAuthUrl: PKCE challenge is required for Gmail. The dispatcher should have generated one via generatePkce().",
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
      // The state row was missing the code_verifier — either the connect
      // path didn't issue PKCE (impossible if Gmail is the only caller),
      // or the row was tampered with, or consumeState's defensive AND
      // returned null on a half-populated row. Refuse to attempt the
      // token exchange — Google would reject it anyway with
      // invalid_grant.
      throw new Error(
        "gmailOAuth.handleCallback: PKCE code_verifier is required for Gmail; the consumed oauth_states row had none.",
      );
    }

    const tokens = await exchangeGoogleAuthCode({
      code,
      codeVerifier: pkce.codeVerifier,
      redirectUrl: getRedirectUrl(),
    });

    // Look up the connected account's email via the Gmail API. Uses the
    // freshly-issued access token; gmail.modify (the manifest's sole
    // scope) covers users.getProfile.
    const profileRes = await fetch(
      `${gmailApiBase()}/gmail/v1/users/me/profile`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
    if (!profileRes.ok) {
      throw new Error(
        `Gmail users.getProfile failed: HTTP ${profileRes.status}`,
      );
    }
    const profile = (await profileRes.json()) as GmailUserProfile;
    if (!profile.emailAddress) {
      throw new Error("Gmail users.getProfile response missing emailAddress.");
    }

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(tokens.accessToken),
        refreshTokenEncrypted: encryptToken(tokens.refreshToken),
        accessTokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopesGranted,
      },
      account: {
        providerAccountId: profile.emailAddress,
        displayName: profile.emailAddress,
        metadata: {
          email: profile.emailAddress,
          historyId: profile.historyId ?? null,
        },
      },
    };
  },

  refreshToken: refreshGoogleToken,

  async revoke(_token: string): Promise<void> {
    // Google provides https://oauth2.googleapis.com/revoke. Implementation
    // deferred to the disconnect-UX slice (parent Slice 2 Decision 4 +
    // Slice 2c Decision 2c-6) — matches Slack's stub pattern. When this
    // slice ships, both providers' revoke methods land together with the
    // disconnect button UI.
  },
};
