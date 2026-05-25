import {
  RefreshNotSupportedError,
  type EncryptedTokens,
  type ProviderOAuth,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import { mailchimpLoginBase } from "@/integrations/_shared/mailchimp/api/_base";
import { resolveMailchimpAccount } from "@/integrations/_shared/mailchimp/api/me";

/**
 * Mailchimp OAuth implementation.
 *
 * Slice 14 — V2's first email-marketing provider + first
 * per-datacenter API-host routing model. See
 * `docs/slices/slice-14-mailchimp.md` §"OAuth flow" and §"Confirmed
 * scope decisions".
 *
 * Wire-format (per current Mailchimp Marketing API OAuth quickstart,
 * cross-checked against V1's
 * [`oauthConfig.ts:577-590`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/oauthConfig.ts#L577)
 * and
 * [`provider-registry.ts:654-694`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L654)):
 *
 *   - **Authorize URL.** GET
 *     `https://login.mailchimp.com/oauth2/authorize?response_type=code&client_id=…&redirect_uri=…&state=…`
 *     **NO `scope=` parameter.** Mailchimp's OAuth2 flow grants
 *     account-wide access and does NOT enforce scope parameters. The
 *     manifest's synthetic `scopes.required: ["account_access"]` is a
 *     documentation-only declaration to satisfy V2's contract;
 *     `buildAuthUrl` ignores the scopes parameter and omits `scope=`
 *     from the URL. No PKCE.
 *   - **Token exchange.** POST `https://login.mailchimp.com/oauth2/token`
 *     with `Content-Type: application/x-www-form-urlencoded` body
 *     `grant_type=authorization_code&client_id=…&client_secret=…&redirect_uri=…&code=…`.
 *     **Body-auth** — `client_secret` rides in the form body, NOT in
 *     an `Authorization: Basic` header (V1's `authMethod: "body"` at
 *     `oauthConfig.ts:585`). Response: `{ access_token,
 *     expires_in: 0, scope: null }`. **No `refresh_token`, no real
 *     `expires_in`** — Mailchimp tokens don't expire and don't have
 *     a refresh grant (the `expires_in: 0` value is sentinel — see
 *     current Mailchimp docs).
 *   - **Auxiliary metadata + API-root GETs.** After token exchange,
 *     fetch:
 *       1. `GET https://login.mailchimp.com/oauth2/metadata` with
 *          `Authorization: OAuth <token>` — **`OAuth ` prefix, NOT
 *          `Bearer `**. Returns `dc`, `accountname`, login email,
 *          api_endpoint, etc. Required for every subsequent API call.
 *       2. `GET https://${dc}.api.mailchimp.com/3.0/` with
 *          `Authorization: Bearer <token>` (Bearer here, not OAuth).
 *          Returns `account_id` — used as `providerAccountId`.
 *     Both implemented in `_shared/mailchimp/api/me.ts`. Both are
 *     fail-loud (no fallback) — without dc, no subsequent API call
 *     can be made; without accountId, no stable identity. V1's
 *     runtime dc-refetch fallback (`utils.ts:37-75`) is intentionally
 *     NOT reproduced.
 *
 * **Non-refreshable.** `refreshToken()` throws
 * `RefreshNotSupportedError("mailchimp")` — matches V2's Slack /
 * Notion / Shopify / GitHub contract. V1's
 * [`authSchemes.ts:64`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/authSchemes.ts#L64)
 * declares `'oauth_with_refresh'` but
 * [`provider-registry.ts:662`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/provider-registry.ts#L662)
 * hardcodes `refresh_token: null` — V1's classification is dead
 * config. V2 corrects.
 *
 * `revoke()` is a stub deferred to the disconnect-UX slice — matches
 * every other V2 provider. Mailchimp does not document a public
 * token revocation endpoint; "uninstall" is user-initiated from the
 * Mailchimp account-connected-apps UI.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL — base for the OAuth callback URL.
 *   - MAILCHIMP_CLIENT_ID — OAuth App's `client_id` from
 *     https://login.mailchimp.com/account/oauth2/client/list.
 *   - MAILCHIMP_CLIENT_SECRET — OAuth App's secret. Used here for
 *     OAuth token exchange ONLY.
 *   - MAILCHIMP_LOGIN_BASE / MAILCHIMP_API_BASE_OVERRIDE — e2e
 *     overrides (production never sets these; defaults point at real
 *     `login.mailchimp.com` and the per-dc `${dc}.api.mailchimp.com`
 *     respectively).
 */

// ─── Env helpers ────────────────────────────────────────────────────────────

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/mailchimp/callback`;
}

function getClientId(): string {
  const id = process.env.MAILCHIMP_CLIENT_ID;
  if (!id) throw new Error("MAILCHIMP_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.MAILCHIMP_CLIENT_SECRET;
  if (!secret) throw new Error("MAILCHIMP_CLIENT_SECRET env var is not set.");
  return secret;
}

// ─── Wire-format types ──────────────────────────────────────────────────────

interface MailchimpTokenSuccess {
  access_token: string;
  expires_in?: number;
  scope?: string | null;
  token_type?: string;
}

interface MailchimpTokenError {
  error?: string;
  error_description?: string;
}

async function readMailchimpErrorCode(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as MailchimpTokenError;
    if (parsed.error_description) return parsed.error_description;
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

// ─── ProviderOAuth ──────────────────────────────────────────────────────────

export const mailchimpOAuth: ProviderOAuth = {
  // No generatePkce — Mailchimp's authorize endpoint does not accept
  // PKCE parameters.

  buildAuthUrl(state, _scopes, _pkce) {
    // _pkce is always null for Mailchimp (manifest omits
    // generatePkce). _scopes is the manifest's synthetic
    // ["account_access"] — IGNORED. Mailchimp's authorize endpoint
    // does not honor a `scope` parameter; including it would be
    // documentation only. V2 omits `scope=` entirely from the URL
    // for honesty with the actual access model. See manifest doc
    // comment §"scopes.required: ['account_access']" for the
    // rationale.
    const params = new URLSearchParams({
      response_type: "code",
      client_id: getClientId(),
      redirect_uri: getRedirectUrl(),
      state,
    });
    return `${mailchimpLoginBase()}/oauth2/authorize?${params.toString()}`;
  },

  async handleCallback(code, _state, _pkce) {
    // _pkce is always null for Mailchimp. Body-auth: client_secret
    // rides in the form body, NOT in an Authorization header.
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUrl(),
      code,
    });
    const tokenRes = await fetch(`${mailchimpLoginBase()}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!tokenRes.ok) {
      throw new Error(
        `Mailchimp token exchange failed: ${await readMailchimpErrorCode(tokenRes)}`,
      );
    }
    const json = (await tokenRes.json()) as MailchimpTokenSuccess;
    if (!json.access_token) {
      throw new Error("Mailchimp token response missing access_token.");
    }
    if (json.token_type && json.token_type.toLowerCase() !== "bearer") {
      // Mailchimp tokens are always token_type=bearer per current
      // docs. A different value means the response shape changed.
      throw new Error(
        `Unexpected Mailchimp token_type: ${json.token_type} (expected 'bearer').`,
      );
    }

    // Auxiliary metadata + /3.0/ root GETs — see
    // `_shared/mailchimp/api/me.ts`. Fail loud on either; without
    // dc the integration is unusable, without accountId we can't
    // compute a stable providerAccountId. This is during initial
    // OAuth so there's no integration row yet to wrap in
    // `refreshAndRetry`; plain fetches are the right shape.
    const account = await resolveMailchimpAccount(json.access_token);

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(json.access_token),
        // Mailchimp tokens have no refresh grant.
        refreshTokenEncrypted: null,
        // Mailchimp tokens don't expire. The token response's
        // `expires_in: 0` is sentinel, not a real lifetime — per
        // current Mailchimp docs. V2 normalizes to null.
        accessTokenExpiresAt: null,
        // The token response's `scope: null` matches V2's truth
        // about Mailchimp's access model — no real scopes are
        // enforced. V2 records the manifest's synthetic scope so
        // the row matches what the consent UI displayed; see the
        // manifest doc comment.
        scopes: ["account_access"],
      },
      account: {
        // The stable Mailchimp account_id (e.g.
        // "8d3a3db4d97663a9074efcc16") IS the account id — V1's
        // `provider-registry.ts:684-689` populates this for display
        // but doesn't use it as a stable identifier; V2 corrects.
        providerAccountId: account.accountId,
        displayName:
          account.accountName && account.accountName.length > 0
            ? account.accountName
            : account.email && account.email.length > 0
              ? account.email
              : account.accountId,
        metadata: {
          // dc is REQUIRED on every subsequent API call. Persisted
          // here at OAuth callback; read back by every action /
          // trigger / lifecycle via _shared/mailchimp/api/_base.ts.
          dc: account.dc,
          mailchimpAccountId: account.accountId,
          accountName: account.accountName,
          email: account.email,
          apiEndpoint: account.apiEndpoint,
          loginUrl: account.loginUrl,
          // Document the consent surface. Empty array would
          // misleadingly imply "no permissions granted"; V2 records
          // the synthetic scope to keep audit logs honest.
          scopesGranted: ["account_access"],
        },
      },
    };
  },

  async refreshToken(_refreshTokenPlaintext): Promise<EncryptedTokens> {
    // Mailchimp tokens have no refresh grant. Mirrors V2's Slack /
    // Notion / Shopify / GitHub non-refreshable contract —
    // `refreshAndRetry` catches `RefreshNotSupportedError` and
    // translates to `IntegrationActionRequiredError` so the user
    // sees a "reconnect your Mailchimp account" prompt instead of a
    // stale-token retry loop.
    throw new RefreshNotSupportedError("mailchimp");
  },

  async revoke(_token: string): Promise<void> {
    // Deferred to the disconnect-UX slice — matches every other V2
    // provider's revoke pattern. Mailchimp does not document a
    // public token revocation endpoint; "uninstall" is user-initiated
    // from the account-connected-apps UI.
  },
};
