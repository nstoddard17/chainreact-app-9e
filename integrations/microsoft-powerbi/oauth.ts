import { type ProviderOAuth } from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import {
  buildMicrosoftAuthUrl,
  exchangeMicrosoftAuthCode,
  generateMicrosoftPkce,
  refreshMicrosoftToken,
} from "@/integrations/_shared/microsoft/oauth";

/**
 * Microsoft Power BI OAuth implementation.
 *
 * Shares the Microsoft OAuth wire-format helpers (PKCE S256, `/common`
 * authorize + token endpoints, refresh preserve-old policy) with every
 * other Microsoft provider. Same Azure AD app: MICROSOFT_CLIENT_ID /
 * MICROSOFT_CLIENT_SECRET.
 *
 * What's Power BI-specific:
 *   - Redirect URL: /api/integrations/oauth/microsoft-powerbi/callback.
 *   - Scopes are Power BI Service resource scopes
 *     (`https://analysis.windows.net/powerbi/api/…`), NOT Graph scopes —
 *     the access token's audience is the Power BI API and it CANNOT call
 *     Graph `/me`.
 *   - accountId resolution therefore uses the OIDC `id_token` returned by
 *     the token endpoint (scope list includes `openid profile email`).
 *     The id_token arrives over TLS directly from
 *     `login.microsoftonline.com` in the code-exchange response — the
 *     same trust boundary as the access token itself — so we decode its
 *     payload without an extra signature-verification dependency.
 *     Claim policy: `email` ?? `preferred_username` (the UPN), mirroring
 *     Graph siblings' `mail ?? userPrincipalName`.
 *
 * `revoke()` is a stub deferred to the disconnect-UX slice (matches every
 * other Microsoft provider).
 */

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/microsoft-powerbi/callback`;
}

interface MicrosoftIdTokenClaims {
  email?: string;
  preferred_username?: string;
  oid?: string;
  tid?: string;
}

/**
 * Decode the payload segment of a JWT id_token (base64url JSON). No
 * signature verification — see module doc for the trust argument. Throws
 * on malformed input; never logs the token.
 */
export function decodeIdTokenClaims(idToken: string): MicrosoftIdTokenClaims {
  const segments = idToken.split(".");
  if (segments.length !== 3 || !segments[1]) {
    throw new Error("Microsoft id_token is not a well-formed JWT.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Microsoft id_token payload could not be decoded.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Microsoft id_token payload is not an object.");
  }
  const claims = parsed as Record<string, unknown>;
  return {
    email: typeof claims.email === "string" ? claims.email : undefined,
    preferred_username:
      typeof claims.preferred_username === "string"
        ? claims.preferred_username
        : undefined,
    oid: typeof claims.oid === "string" ? claims.oid : undefined,
    tid: typeof claims.tid === "string" ? claims.tid : undefined,
  };
}

export const microsoftPowerBiOAuth: ProviderOAuth = {
  generatePkce: generateMicrosoftPkce,

  buildAuthUrl(state, scopes, pkce, _providerHint, steer) {
    if (pkce === null) {
      throw new Error(
        "microsoftPowerBiOAuth.buildAuthUrl: PKCE challenge is required for Microsoft Power BI. The dispatcher should have generated one via generatePkce().",
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
        "microsoftPowerBiOAuth.handleCallback: PKCE code_verifier is required for Microsoft Power BI; the consumed oauth_states row had none.",
      );
    }

    const tokens = await exchangeMicrosoftAuthCode({
      code,
      codeVerifier: pkce.codeVerifier,
      redirectUrl: getRedirectUrl(),
    });

    if (!tokens.idToken) {
      // The manifest requires `openid`, so a missing id_token means the
      // authorize request was built without the manifest scopes. Fail
      // loud — without it we cannot attribute the connection.
      throw new Error(
        "Microsoft token response missing id_token — the Power BI manifest requires the openid scope for identity resolution.",
      );
    }

    const claims = decodeIdTokenClaims(tokens.idToken);
    const email = claims.email ?? claims.preferred_username;
    if (!email) {
      throw new Error(
        "Microsoft id_token missing both email and preferred_username claims.",
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
          entraObjectId: claims.oid ?? null,
          emailClaim: claims.email ? "email" : "preferred_username",
        },
      },
    };
  },

  refreshToken: refreshMicrosoftToken,

  async revoke(_token: string): Promise<void> {
    // Deferred to disconnect-UX slice (matches every Microsoft provider).
  },
};
