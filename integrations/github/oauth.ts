import {
  RefreshNotSupportedError,
  type EncryptedTokens,
  type ProviderOAuth,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";
import {
  GITHUB_API_VERSION,
  githubApiBase,
  githubAuthorizeBase,
} from "@/integrations/_shared/github/api/_base";

/**
 * GitHub OAuth implementation.
 *
 * Slice 14b — V2's developer-tools provider. See
 * `docs/slices/slice-14b-github.md` §"OAuth model" and §"V1 audit".
 *
 * Wire-format (per https://docs.github.com/en/apps/oauth-apps/building-oauth-apps,
 * cross-checked against V1's `lib/integrations/oauthConfig.ts:149-163`):
 *
 *   - **Authorize URL.** GET
 *     `https://github.com/login/oauth/authorize?client_id=…&scope=…&redirect_uri=…&state=…`
 *     Scopes are **space-separated** (GitHub convention). No PKCE —
 *     GitHub's authorize endpoint doesn't accept `code_challenge` /
 *     `code_challenge_method` parameters.
 *   - **Token exchange.** POST `https://github.com/login/oauth/access_token`
 *     with `Content-Type: application/x-www-form-urlencoded` body
 *     `grant_type=authorization_code&code=…&client_id=…&client_secret=…&redirect_uri=…`.
 *     **Body-auth** — `client_secret` rides in the form body, NOT in
 *     an `Authorization: Basic` header (matches V1's
 *     `oauthConfig.ts:154` `authMethod: "body"`). The `Accept:
 *     application/json` header elicits a JSON response (GitHub
 *     defaults to form-encoded). Response: `{ access_token,
 *     token_type: "bearer", scope: "repo,gist,read:org" }`. **No
 *     `refresh_token`, no `expires_in`** — GitHub OAuth App tokens
 *     don't expire and don't have a refresh grant.
 *   - **Auxiliary `/user` GET.** After token exchange, fetch
 *     `https://api.github.com/user` with `Authorization: token <token>`
 *     (GitHub's idiomatic header — NOT `Bearer`) and `Accept:
 *     application/vnd.github+json` and `X-GitHub-Api-Version:
 *     2022-11-28`. The response's `login` becomes
 *     `providerAccountId`; `name || login` becomes `displayName`;
 *     `id` and `avatar_url` ride in metadata for the
 *     connection-management UI.
 *
 * **Non-refreshable.** `refreshToken()` throws
 * `RefreshNotSupportedError("github")` — matches V2's Slack / Notion
 * / Shopify contract. V1's
 * [`authSchemes.ts:83`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/integrations/authSchemes.ts#L83)
 * confirms `'non_refreshable'`.
 *
 * `revoke()` is a stub deferred to the disconnect-UX slice — matches
 * every other V2 provider. GitHub provides
 * `DELETE /applications/{client_id}/token` for revocation; landing
 * the disconnect UX slice will wire it up across all providers
 * simultaneously.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL — base for the OAuth callback URL.
 *   - GITHUB_CLIENT_ID — OAuth App's `client_id`.
 *   - GITHUB_CLIENT_SECRET — OAuth App's secret. Used here for OAuth
 *     token exchange ONLY. **Distinct from `GITHUB_WEBHOOK_SECRET`**
 *     (Slice 14b Commit 4) — V2 fixes V1's defense-in-depth
 *     anti-pattern of falling back to `GITHUB_CLIENT_SECRET` as a
 *     webhook-secret when the dedicated env var is missing.
 *   - GITHUB_AUTHORIZE_BASE / GITHUB_API_BASE — e2e overrides
 *     (production never sets these; defaults point at real
 *     `github.com` / `api.github.com`).
 */

// ─── Env helpers ────────────────────────────────────────────────────────────

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/github/callback`;
}

function getClientId(): string {
  const id = process.env.GITHUB_CLIENT_ID;
  if (!id) throw new Error("GITHUB_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.GITHUB_CLIENT_SECRET;
  if (!secret) throw new Error("GITHUB_CLIENT_SECRET env var is not set.");
  return secret;
}

// ─── Wire-format types ──────────────────────────────────────────────────────

interface GitHubTokenSuccess {
  access_token: string;
  token_type?: string;
  scope?: string;
}

interface GitHubTokenError {
  error: string;
  error_description?: string;
}

interface GitHubUserSuccess {
  login: string;
  id: number;
  name?: string | null;
  avatar_url?: string | null;
}

async function readGitHubErrorCode(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as GitHubTokenError;
    if (parsed.error) return parsed.error;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

// ─── ProviderOAuth ──────────────────────────────────────────────────────────

export const githubOAuth: ProviderOAuth = {
  // No generatePkce — GitHub's authorize endpoint does not accept
  // PKCE parameters.

  buildAuthUrl(state, scopes, _pkce) {
    // _pkce is always null for GitHub (manifest omits generatePkce).
    // Scopes are space-separated per GitHub OAuth Apps convention
    // (V1's `oauthConfig.ts` doesn't customize the joiner; GitHub
    // accepts both space-separated and `,`-separated, but the
    // canonical form is space-separated).
    const params = new URLSearchParams({
      client_id: getClientId(),
      scope: scopes.join(" "),
      redirect_uri: getRedirectUrl(),
      state,
    });
    return `${githubAuthorizeBase()}/login/oauth/authorize?${params.toString()}`;
  },

  async handleCallback(code, _state, _pkce) {
    // _pkce is always null for GitHub. Body-auth: client_secret
    // rides in the form body, NOT in an Authorization header.
    // `Accept: application/json` elicits a JSON response (GitHub
    // defaults to form-encoded).
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUrl(),
    });
    const tokenRes = await fetch(
      `${githubAuthorizeBase()}/login/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params.toString(),
      },
    );
    if (!tokenRes.ok) {
      throw new Error(
        `GitHub token exchange failed: ${await readGitHubErrorCode(tokenRes)}`,
      );
    }
    const json = (await tokenRes.json()) as
      | GitHubTokenSuccess
      | GitHubTokenError;
    if ("error" in json && json.error) {
      // GitHub returns 200 OK with `{ error, error_description }` in
      // the body when the authorization code is invalid (rather than
      // a non-2xx status). Detect this shape explicitly.
      throw new Error(`GitHub OAuth error: ${json.error}`);
    }
    const success = json as GitHubTokenSuccess;
    if (!success.access_token) {
      throw new Error("GitHub token response missing access_token.");
    }
    if (success.token_type && success.token_type.toLowerCase() !== "bearer") {
      // GitHub OAuth App tokens are always token_type=bearer per
      // current docs. A different value means the response shape
      // changed or this isn't an OAuth App flow.
      throw new Error(
        `Unexpected GitHub token_type: ${success.token_type} (expected 'bearer').`,
      );
    }

    // Auxiliary /user GET — GitHub doesn't return account info on the
    // token-exchange response, so we fetch /user to populate
    // providerAccountId. Uses GitHub's idiomatic `Authorization: token <token>`
    // header (NOT `Bearer`). This is during initial OAuth so there's
    // no integration row yet to wrap in `refreshAndRetry`; a plain
    // fetch is the right shape.
    const userRes = await fetch(`${githubApiBase()}/user`, {
      headers: {
        Authorization: `token ${success.access_token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    });
    if (!userRes.ok) {
      throw new Error(
        `GitHub /user lookup failed: HTTP ${userRes.status}`,
      );
    }
    const user = (await userRes.json()) as GitHubUserSuccess;
    if (!user.login) {
      throw new Error("GitHub /user response missing login.");
    }

    // GitHub returns scope as a comma-separated string (e.g.
    // `"repo,gist,read:org"`). Trimming tolerates GitHub's
    // occasional `"repo, gist"` shape with whitespace after commas.
    const scopesGranted = (success.scope ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(success.access_token),
        // GitHub OAuth App tokens have no refresh grant.
        refreshTokenEncrypted: null,
        // GitHub OAuth App tokens don't expire.
        accessTokenExpiresAt: null,
        scopes: scopesGranted,
      },
      account: {
        // The GitHub login (e.g. `"octocat"`) IS the account id —
        // stable for the life of the GitHub account.
        providerAccountId: user.login,
        displayName: user.name && user.name.length > 0 ? user.name : user.login,
        metadata: {
          login: user.login,
          githubUserId: user.id,
          avatarUrl: user.avatar_url ?? null,
          scopesGranted,
        },
      },
    };
  },

  async refreshToken(_refreshTokenPlaintext): Promise<EncryptedTokens> {
    // GitHub OAuth App tokens don't have a refresh grant. Mirrors
    // V2's Slack / Notion / Shopify non-refreshable contract —
    // `refreshAndRetry` catches `RefreshNotSupportedError` and
    // translates to `IntegrationActionRequiredError` so the user
    // sees a "reconnect your GitHub account" prompt instead of a
    // stale-token retry loop.
    throw new RefreshNotSupportedError("github");
  },

  async revoke(_token: string): Promise<void> {
    // Deferred to the disconnect-UX slice — matches every other V2
    // provider's revoke pattern. GitHub provides
    // `DELETE /applications/{client_id}/token` for revocation; the
    // disconnect UX slice will wire it up across all providers
    // simultaneously.
  },
};
