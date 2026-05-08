import { createHash, randomBytes } from "node:crypto";
import {
  type EncryptedTokens,
  type PkceGeneration,
  type ProviderOAuth,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";

/**
 * Microsoft Outlook OAuth implementation.
 *
 * First non-Google non-Slack provider in V2. Uses Microsoft's identity
 * platform v2.0 endpoint via the multi-tenant `/common/` issuer so both
 * personal Microsoft accounts (consumer Outlook) and work / school
 * tenants authenticate through the same client app.
 *
 * Wire-format (OAuth 2.0 + PKCE S256):
 *   - Authorize: ${MICROSOFT_AUTHORIZE_BASE}/common/oauth2/v2.0/authorize
 *   - Token:     ${MICROSOFT_TOKEN_BASE}/common/oauth2/v2.0/token
 *   - Account:   ${MICROSOFT_GRAPH_API_BASE}/v1.0/me?$select=mail,userPrincipalName,id
 *
 * PKCE is mandatory in V2 even though V1's lib/microsoft-graph/auth.ts
 * doesn't use it. The V2 dispatcher's `state.ts` issues PKCE pairs for
 * every provider that implements `generatePkce`; opting out would create
 * a per-provider exception with no upside (Microsoft accepts PKCE on
 * confidential-client flows, treats it as defense-in-depth alongside
 * client_secret).
 *
 * Refresh-token rotation policy (mirrors V1 auth.ts:113 + Google's
 * preserve-old policy):
 *   - When the refresh response includes a new `refresh_token`, encrypt
 *     and return it as `refreshTokenEncrypted`.
 *   - When omitted, re-encrypt the input plaintext refresh token and
 *     return that — the row's refresh credential stays unchanged.
 *
 * Account ID resolution:
 *   - Use `mail` from Graph /me when non-null (work/school accounts and
 *     properly-provisioned consumer accounts).
 *   - Fall back to `userPrincipalName` for consumer accounts where the
 *     mailbox hasn't been provisioned at consent time (the OAuth flow
 *     must still produce a stable identifier so the integration row is
 *     unique).
 *   - The Graph object id (`id` field) is captured in `account.metadata.graphId`
 *     for downstream calls that need the immutable identifier.
 *
 * Env vars read here:
 *   - MICROSOFT_CLIENT_ID — required at call time (throws if unset).
 *   - MICROSOFT_CLIENT_SECRET — required at call time (throws if unset).
 *   - MICROSOFT_AUTHORIZE_BASE — optional e2e override; default
 *     `https://login.microsoftonline.com`.
 *   - MICROSOFT_TOKEN_BASE — optional e2e override; default same as
 *     above. Two separate vars because while the production endpoints
 *     share the host, the e2e mock may serve them on different ports
 *     (matches the Google AUTHORIZE/TOKEN split).
 *   - MICROSOFT_GRAPH_API_BASE — optional e2e override; default
 *     `https://graph.microsoft.com`. Also read by api wrappers in
 *     subsequent commits.
 *   - NEXT_PUBLIC_APP_URL — for the redirect URL.
 *
 * `revoke()` is a stub deferred to the disconnect-UX slice (matches
 * Gmail / Calendar / Drive / Sheets / Slack patterns).
 */

// ─── Env helpers ──────────────────────────────────────────────────────────────

function microsoftAuthorizeBase(): string {
  return (
    process.env.MICROSOFT_AUTHORIZE_BASE ?? "https://login.microsoftonline.com"
  );
}

function microsoftTokenBase(): string {
  return (
    process.env.MICROSOFT_TOKEN_BASE ?? "https://login.microsoftonline.com"
  );
}

function microsoftGraphApiBase(): string {
  return process.env.MICROSOFT_GRAPH_API_BASE ?? "https://graph.microsoft.com";
}

function getClientId(): string {
  const id = process.env.MICROSOFT_CLIENT_ID;
  if (!id) throw new Error("MICROSOFT_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!secret) throw new Error("MICROSOFT_CLIENT_SECRET env var is not set.");
  return secret;
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/microsoft-outlook/callback`;
}

// ─── PKCE ────────────────────────────────────────────────────────────────────

/**
 * 32 random bytes → ~43 base64url chars (RFC 7636 §4.1 minimum). Method
 * is hardcoded S256, matching the shared Google PKCE generator.
 */
export function generateMicrosoftPkce(): PkceGeneration {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: "S256",
  };
}

// ─── Wire-format types ──────────────────────────────────────────────────────

interface MicrosoftTokenSuccess {
  access_token: string;
  /**
   * Microsoft returns a refresh_token when `offline_access` is granted.
   * The manifest declares `offline_access` as required so the token
   * exchange path expects it; refresh responses MAY omit it (preserve-old
   * policy applies).
   */
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

interface MicrosoftTokenError {
  error: string;
  error_description?: string;
}

interface GraphMeResponse {
  id?: string;
  /**
   * Email address. Null for consumer accounts where the mailbox isn't
   * provisioned at consent time. Falls back to `userPrincipalName`.
   */
  mail?: string | null;
  /** UPN — sign-in identifier; always present on a successful /me call. */
  userPrincipalName?: string;
  displayName?: string;
}

// ─── Provider implementation ────────────────────────────────────────────────

export const microsoftOutlookOAuth: ProviderOAuth = {
  generatePkce: generateMicrosoftPkce,

  buildAuthUrl(state, scopes, pkce) {
    if (pkce === null) {
      throw new Error(
        "microsoftOutlookOAuth.buildAuthUrl: PKCE challenge is required for Microsoft Outlook. The dispatcher should have generated one via generatePkce().",
      );
    }
    const params = new URLSearchParams({
      response_type: "code",
      response_mode: "query",
      client_id: getClientId(),
      redirect_uri: getRedirectUrl(),
      // Microsoft v2 endpoint accepts space-separated scopes.
      scope: scopes.join(" "),
      state,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: pkce.codeChallengeMethod,
    });
    return `${microsoftAuthorizeBase()}/common/oauth2/v2.0/authorize?${params.toString()}`;
  },

  async handleCallback(code, _state, pkce) {
    if (pkce === null || !pkce.codeVerifier) {
      throw new Error(
        "microsoftOutlookOAuth.handleCallback: PKCE code_verifier is required for Microsoft Outlook; the consumed oauth_states row had none.",
      );
    }

    // Exchange the auth code for tokens.
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: getClientId(),
      client_secret: getClientSecret(),
      code,
      redirect_uri: getRedirectUrl(),
      code_verifier: pkce.codeVerifier,
    });

    const tokenRes = await fetch(
      `${microsoftTokenBase()}/common/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      },
    );
    if (!tokenRes.ok) {
      throw new Error(
        `Microsoft token exchange failed: ${await readErrorCode(tokenRes)}`,
      );
    }
    const tokenJson = (await tokenRes.json()) as MicrosoftTokenSuccess;
    if (!tokenJson.access_token) {
      throw new Error("Microsoft token response missing access_token.");
    }
    if (!tokenJson.refresh_token) {
      // First-connect with offline_access should always return a refresh
      // token. Missing one means scopes were re-granted without
      // offline_access (impossible if buildAuthUrl ran correctly with
      // the manifest's required scopes). Fail loud — the refresh path
      // would silently break otherwise.
      throw new Error(
        "Microsoft token response missing refresh_token — manifest requires offline_access which should always issue one.",
      );
    }

    // Resolve the connected account's email via Graph /me.
    const meRes = await fetch(
      `${microsoftGraphApiBase()}/v1.0/me?$select=mail,userPrincipalName,id`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      },
    );
    if (!meRes.ok) {
      throw new Error(`Microsoft Graph /me failed: HTTP ${meRes.status}`);
    }
    const me = (await meRes.json()) as GraphMeResponse;
    // Personal accounts can return mail: null; fall back to UPN.
    const email = me.mail ?? me.userPrincipalName;
    if (!email) {
      throw new Error(
        "Microsoft Graph /me response missing both mail and userPrincipalName.",
      );
    }

    const expiresAt =
      typeof tokenJson.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + tokenJson.expires_in
        : null;
    const scopesGranted = (tokenJson.scope ?? "").split(" ").filter(Boolean);

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(tokenJson.access_token),
        refreshTokenEncrypted: encryptToken(tokenJson.refresh_token),
        accessTokenExpiresAt: expiresAt,
        scopes: scopesGranted,
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

  async refreshToken(refreshTokenPlaintext: string): Promise<EncryptedTokens> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshTokenPlaintext,
    });
    const res = await fetch(
      `${microsoftTokenBase()}/common/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Microsoft token refresh failed: ${await readErrorCode(res)}`,
      );
    }
    const json = (await res.json()) as MicrosoftTokenSuccess;
    if (!json.access_token) {
      throw new Error("Microsoft refresh response missing access_token.");
    }
    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;
    const scopesGranted = (json.scope ?? "").split(" ").filter(Boolean);
    return {
      accessTokenEncrypted: encryptToken(json.access_token),
      // Preserve-old policy: rotation is opportunistic. Microsoft
      // typically rotates but spec-allowed omission is honored.
      refreshTokenEncrypted: json.refresh_token
        ? encryptToken(json.refresh_token)
        : encryptToken(refreshTokenPlaintext),
      accessTokenExpiresAt: expiresAt,
      scopes: scopesGranted,
    };
  },

  async revoke(_token: string): Promise<void> {
    // Deferred to disconnect-UX slice (matches Gmail / Calendar / Drive /
    // Sheets / Slack patterns). Microsoft does expose
    // /common/oauth2/v2.0/logout for refresh-token revocation; wire-up
    // belongs with the cross-provider disconnect handler.
  },
};

async function readErrorCode(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as MicrosoftTokenError;
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}
