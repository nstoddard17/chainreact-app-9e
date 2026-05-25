import {
  type ProviderOAuth,
  RefreshNotSupportedError,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";

/**
 * Notion OAuth implementation.
 *
 * V2's first non-Google / non-Microsoft OAuth provider. Slice 9 Commit
 * 2 — see `docs/slices/slice-9-notion.md` §"OAuth model — long-lived
 * token, no refresh".
 *
 * Wire-format (per https://developers.notion.com/docs/authorization,
 * confirmed against the Commit 1 audit):
 *   - Authorize URL: `${base}/v1/oauth/authorize?client_id=…&response_type=code&owner=user&redirect_uri=…&state=…`
 *     Notion's authorize URL does NOT take a `scope` parameter —
 *     capabilities are configured in the integration's developer-portal
 *     settings. The dispatcher passes `requestedScopes` from the manifest
 *     to `buildAuthUrl`, but this implementation IGNORES them per
 *     Notion's wire requirement.
 *   - Token exchange: POST `${base}/v1/oauth/token`
 *     - HTTP Basic auth header: `Authorization: Basic ${base64(client_id:client_secret)}`
 *     - Content-Type: `application/json` (NOT form-encoded — Notion is
 *       different from Slack/Microsoft/Google here).
 *     - Body: `{ grant_type: "authorization_code", code, redirect_uri }`.
 *     - Response (200): `{ access_token, token_type: "bearer", bot_id,
 *       workspace_id, workspace_name?, workspace_icon?, owner,
 *       refresh_token?, duplicated_template_id? }`.
 *
 * No PKCE — Notion does not require/support PKCE on its OAuth flow.
 * `generatePkce` is omitted; the dispatcher passes `null` to
 * `buildAuthUrl` and `handleCallback`.
 *
 * Token model — long-lived access token, refresh DROPPED per Slice 9
 * scope decision:
 *   Notion's response includes a `refresh_token` per current docs, but
 *   Slice 9 intentionally does NOT store or use it. `handleCallback`
 *   sets `refreshTokenEncrypted: null`. `refreshToken()` throws
 *   `RefreshNotSupportedError` immediately — V2's
 *   `services/oauth/refreshAndRetry.ts` catches this and surfaces
 *   `IntegrationActionRequiredError(reason: "refresh_not_supported")`,
 *   prompting the user to reconnect. This validates V2's
 *   non-refreshable OAuth path on a real provider. Refresh-token
 *   support is an opt-in follow-up that flips the manifest's
 *   `refreshable` flag, stores the encrypted refresh token, and
 *   replaces this `refreshToken()` body with a real exchange — none of
 *   which breaks the manifest contract.
 *
 * `revoke()` is a stub — Notion does not provide a token revocation
 * endpoint as of this commit. Users disconnect via
 * notion.so/my-integrations. Matches every other V2 provider's revoke
 * pattern (Slice 1E+ deferred work).
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL — base for the OAuth callback URL.
 *   - NOTION_CLIENT_ID / NOTION_CLIENT_SECRET — OAuth credentials from
 *     the Notion developer portal (notion.so/my-integrations).
 *   - NOTION_AUTHORIZE_BASE / NOTION_API_BASE — e2e overrides
 *     (production never sets these; defaults point at real Notion).
 */

/**
 * Base URLs are env-overridable for e2e testing only. Production sets
 * neither variable; defaults point at real Notion.
 */
function notionAuthorizeBase(): string {
  return process.env.NOTION_AUTHORIZE_BASE ?? "https://api.notion.com";
}

function notionApiBase(): string {
  return process.env.NOTION_API_BASE ?? "https://api.notion.com";
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/notion/callback`;
}

function getClientId(): string {
  const id = process.env.NOTION_CLIENT_ID;
  if (!id) throw new Error("NOTION_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.NOTION_CLIENT_SECRET;
  if (!secret) throw new Error("NOTION_CLIENT_SECRET env var is not set.");
  return secret;
}

interface NotionTokenResponse {
  access_token: string;
  token_type?: "bearer";
  bot_id: string;
  workspace_id: string;
  workspace_name?: string | null;
  workspace_icon?: string | null;
  /**
   * Per current Notion docs, the response includes a refresh_token.
   * Slice 9 intentionally drops it on the floor — see file header.
   */
  refresh_token?: string | null;
  owner?: Record<string, unknown>;
  duplicated_template_id?: string | null;
}

export const notionOAuth: ProviderOAuth = {
  // No generatePkce — Notion does not use PKCE.

  buildAuthUrl(state, _scopes) {
    // Notion's authorize URL does NOT take a `scope` parameter.
    // _scopes is ignored — see file header.
    const params = new URLSearchParams({
      client_id: getClientId(),
      response_type: "code",
      owner: "user",
      redirect_uri: getRedirectUrl(),
      state,
    });
    return `${notionAuthorizeBase()}/v1/oauth/authorize?${params.toString()}`;
  },

  async handleCallback(code, _state) {
    const credentials = Buffer.from(
      `${getClientId()}:${getClientSecret()}`,
    ).toString("base64");
    const res = await fetch(`${notionApiBase()}/v1/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: getRedirectUrl(),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Notion token exchange failed: HTTP ${res.status}${text ? ` ${text}` : ""}`,
      );
    }
    const json = (await res.json()) as NotionTokenResponse;
    if (!json.access_token || !json.bot_id) {
      throw new Error(
        "Notion OAuth response missing access_token or bot_id",
      );
    }

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(json.access_token),
        // Refresh token DROPPED per Slice 9 scope — see file header.
        refreshTokenEncrypted: null,
        // Notion does not document an access-token TTL; treat as
        // long-lived (matches Slack pattern).
        accessTokenExpiresAt: null,
        // Notion does not echo per-flow scopes (capabilities are
        // integration-level). Empty array — manifest's documentary
        // scopes are the source of truth for what the integration can do.
        scopes: [],
      },
      account: {
        providerAccountId: json.bot_id,
        // Workspace name is the most user-recognizable label.
        // Falls back to bot_id when the workspace has no name set.
        displayName: json.workspace_name ?? json.bot_id,
        metadata: {
          botId: json.bot_id,
          workspaceId: json.workspace_id,
          workspaceName: json.workspace_name ?? null,
          workspaceIcon: json.workspace_icon ?? null,
          owner: json.owner ?? null,
        },
      },
    };
  },

  async refreshToken(_refreshToken) {
    // Slice 9 scope: Notion is treated as non-refreshable. V2's
    // refreshAndRetry catches this and surfaces action_required.
    throw new RefreshNotSupportedError("notion");
  },

  async revoke(_token) {
    // Notion does not provide a token revocation endpoint as of
    // 2026-05. Users disconnect via notion.so/my-integrations.
    // Matches every other V2 provider's revoke pattern.
  },
};
