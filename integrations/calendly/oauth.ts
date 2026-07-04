import { createHash, randomBytes } from "node:crypto";
import {
  type EncryptedTokens,
  type PkceGeneration,
  type ProviderOAuth,
  RefreshAuthRequiredError,
  isRefreshAuthRequiredCode,
} from "@/contracts/integration";
import { encryptToken } from "@/core/encryption/tokens";

/**
 * Calendly OAuth implementation — Slice 5.CALENDLY-1.
 *
 * Green-field (no V1 Calendly code existed). Wire-format verified against
 * the official docs (docs/providers/calendly/research.md, 2026-07-04):
 *
 *   - Authorize URL: GET
 *     `${authBase}/oauth/authorize?client_id=…&redirect_uri=…&response_type=code&scope=<space-joined>&state=…&code_challenge=…&code_challenge_method=S256`
 *     Calendly directs PKCE S256 for ALL app types — web apps included —
 *     so this confidential client ships PKCE on top of Basic auth
 *     (contrast Typeform: no PKCE; Asana: PKCE without Basic).
 *   - Token exchange: POST `${authBase}/oauth/token`
 *     - `Authorization: Basic base64(client_id:client_secret)` — the
 *       documented WEB-client token auth (native clients body-auth
 *       instead). Form body: `grant_type`, `code`, `redirect_uri`,
 *       `code_verifier`.
 *     - Response: `{ access_token, refresh_token, token_type: "Bearer",
 *       expires_in: 7200, scope, owner, organization, created_at }` —
 *       `owner` (user URI) + `organization` (org URI) are persisted into
 *       account metadata because webhook-subscription creation needs
 *       BOTH; storing them at connect time saves a /users/me round-trip
 *       at every trigger activation.
 *   - Identity: display identity (name / email) is NOT in the token
 *     response — resolved via `GET ${apiBase}/users/me` (scope
 *     `users:read`), which returns `resource.{uri, name, email, slug,
 *     current_organization, …}`.
 *   - Refresh: POST `${authBase}/oauth/token` with
 *     `grant_type=refresh_token`, Basic auth. Refresh tokens are
 *     SINGLE-USE and ROTATE (enforced for all integrations by
 *     2026-08-31: "a refresh token is revoked immediately after a
 *     successful POST /oauth/token call"), so the rotated token is
 *     persisted on every refresh; reuse of a spent token returns
 *     `invalid_grant` → `RefreshAuthRequiredError` so the dispatcher
 *     marks the row needs-reconnect exactly once.
 *
 * `revoke()` is a stub deferred to the uniform disconnect-UX slice —
 * matches every other V2 provider.
 *
 * Env vars read:
 *   - NEXT_PUBLIC_APP_URL — base for the OAuth callback URL.
 *   - CALENDLY_CLIENT_ID / CALENDLY_CLIENT_SECRET — from the Calendly
 *     developer console (developer.calendly.com/console/apps; the secret
 *     is shown ONLY at app creation).
 *   - CALENDLY_AUTH_BASE / CALENDLY_API_BASE — e2e overrides (production
 *     never sets these; defaults point at `auth.calendly.com` /
 *     `api.calendly.com`).
 */

// ─── Env helpers ────────────────────────────────────────────────────────────

function calendlyAuthBase(): string {
  return process.env.CALENDLY_AUTH_BASE ?? "https://auth.calendly.com";
}

function calendlyApiBase(): string {
  return process.env.CALENDLY_API_BASE ?? "https://api.calendly.com";
}

function getRedirectUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/api/integrations/oauth/calendly/callback`;
}

function getClientId(): string {
  const id = process.env.CALENDLY_CLIENT_ID;
  if (!id) throw new Error("CALENDLY_CLIENT_ID env var is not set.");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.CALENDLY_CLIENT_SECRET;
  if (!secret) throw new Error("CALENDLY_CLIENT_SECRET env var is not set.");
  return secret;
}

function basicAuthHeader(): string {
  const raw = `${getClientId()}:${getClientSecret()}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

// ─── Wire-format types ──────────────────────────────────────────────────────

interface CalendlyTokenSuccess {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  /** URI of the connecting user (docs: "currently always a user"). */
  owner?: string;
  /** URI of the connecting user's organization. */
  organization?: string;
}

interface CalendlyTokenError {
  error?: string;
  error_description?: string;
}

interface CalendlyMeResource {
  uri?: string | null;
  name?: string | null;
  email?: string | null;
  slug?: string | null;
  current_organization?: string | null;
}

interface CalendlyMeResponse {
  resource?: CalendlyMeResource | null;
}

async function readCalendlyErrorCode(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as CalendlyTokenError;
    // Prefer the bare OAuth2 error code (`invalid_grant`) so
    // `isRefreshAuthRequiredCode` can match it exactly.
    if (parsed.error) return parsed.error;
    if (parsed.error_description) return parsed.error_description;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

/** Last path segment of a Calendly resource URI ("…/users/{uuid}" → uuid). */
export function calendlyUuidFromUri(uri: string | null | undefined): string | null {
  if (typeof uri !== "string" || uri.length === 0) return null;
  const trimmed = uri.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx === -1 || idx === trimmed.length - 1) return null;
  return trimmed.slice(idx + 1);
}

/**
 * Resolve connect-time identity via `GET /users/me` (scope `users:read`).
 * The token response carries the user/org URIs but no display identity
 * (name / email), so this call is mandatory for accountIdField=email.
 */
async function resolveIdentity(accessToken: string): Promise<CalendlyMeResource> {
  const meRes = await fetch(`${calendlyApiBase()}/users/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!meRes.ok) {
    throw new Error(`Calendly /users/me lookup failed: HTTP ${meRes.status}`);
  }
  const me = (await meRes.json()) as CalendlyMeResponse;
  const resource = me.resource;
  if (!resource || typeof resource.uri !== "string" || resource.uri.length === 0) {
    throw new Error("Calendly /users/me response missing resource.uri.");
  }
  return resource;
}

/** PKCE S256 pair — Calendly directs S256 for all app types (Asana shape). */
function generateCalendlyPkce(): PkceGeneration {
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

export const calendlyOAuth: ProviderOAuth = {
  generatePkce: generateCalendlyPkce,

  buildAuthUrl(state, scopes, pkce) {
    if (pkce === null) {
      // Should be impossible — the dispatcher always passes PKCE for
      // Calendly because generatePkce returned a non-null value.
      // Defensive throw mirrors asana / airtable / gmail.
      throw new Error(
        "calendlyOAuth.buildAuthUrl: PKCE challenge is required for Calendly. The dispatcher should have generated one via generatePkce().",
      );
    }
    const params = new URLSearchParams({
      client_id: getClientId(),
      redirect_uri: getRedirectUrl(),
      response_type: "code",
      scope: scopes.join(" "),
      state,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: pkce.codeChallengeMethod,
    });
    return `${calendlyAuthBase()}/oauth/authorize?${params.toString()}`;
  },

  async handleCallback(code, _state, pkce) {
    if (pkce === null || !pkce.codeVerifier) {
      throw new Error(
        "calendlyOAuth.handleCallback: missing PKCE code_verifier from the state row. Refusing the token exchange.",
      );
    }
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      redirect_uri: getRedirectUrl(),
      code,
      code_verifier: pkce.codeVerifier,
    });
    const tokenRes = await fetch(`${calendlyAuthBase()}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuthHeader(),
      },
      body: params.toString(),
    });
    if (!tokenRes.ok) {
      throw new Error(
        `Calendly token exchange failed: ${await readCalendlyErrorCode(tokenRes)}`,
      );
    }
    const json = (await tokenRes.json()) as CalendlyTokenSuccess;
    if (!json.access_token) {
      throw new Error("Calendly token response missing access_token.");
    }
    if (!json.refresh_token) {
      // Calendly issues refresh tokens by default; a missing one means
      // the grant is broken — the 2-hour access token would strand the
      // connection. Fail the connect rather than persist a doomed row
      // (Asana / Typeform precedent).
      throw new Error("Calendly token response missing refresh_token.");
    }

    const identity = await resolveIdentity(json.access_token);
    const email = identity.email ?? null;
    // The token response's `owner` is the canonical user URI; fall back
    // to /users/me's resource.uri (they identify the same user).
    const userUri = json.owner ?? identity.uri ?? null;
    const organizationUri =
      json.organization ?? identity.current_organization ?? null;
    const userUuid = calendlyUuidFromUri(userUri);
    if (!userUuid) {
      throw new Error("Calendly connect could not resolve the user URI.");
    }

    // providerAccountId — prefer email per manifest accountIdField, fall
    // back to the user UUID when email is absent.
    const providerAccountId = email ?? userUuid;

    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;

    return {
      tokens: {
        accessTokenEncrypted: encryptToken(json.access_token),
        refreshTokenEncrypted: encryptToken(json.refresh_token),
        accessTokenExpiresAt: expiresAt,
        // Calendly echoes granted scopes as a space-joined string.
        scopes:
          typeof json.scope === "string" && json.scope.length > 0
            ? json.scope.split(" ").filter((s) => s.length > 0)
            : [],
      },
      account: {
        providerAccountId,
        // displayName preference: name (most readable) → email → uuid.
        displayName: identity.name ?? email ?? userUuid,
        metadata: {
          // Webhook-subscription creation needs BOTH URIs; persisting
          // them here saves a /users/me round-trip at every activation
          // (activate.ts still falls back to /users/me when absent).
          calendlyUserUri: userUri,
          organizationUri,
          email,
          name: identity.name ?? null,
        },
      },
    };
  },

  async refreshToken(refreshTokenPlaintext): Promise<EncryptedTokens> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTokenPlaintext,
    });
    const res = await fetch(`${calendlyAuthBase()}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuthHeader(),
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const code = await readCalendlyErrorCode(res);
      if (isRefreshAuthRequiredCode(code)) {
        throw new RefreshAuthRequiredError("calendly", code);
      }
      throw new Error(`Calendly token refresh failed: ${code}`);
    }
    const json = (await res.json()) as CalendlyTokenSuccess;
    if (!json.access_token) {
      throw new Error("Calendly refresh response missing access_token.");
    }

    // Refresh-token ROTATION: single-use tokens, revoked immediately
    // after a successful POST /oauth/token (enforced for all
    // integrations by 2026-08-31) — the rotated token MUST be persisted.
    // Falling back to the old value only if a response ever omits one
    // (defensive; per docs it is always present).
    const refreshTokenToPersist = json.refresh_token ?? refreshTokenPlaintext;

    const expiresAt =
      typeof json.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + json.expires_in
        : null;
    return {
      accessTokenEncrypted: encryptToken(json.access_token),
      refreshTokenEncrypted: encryptToken(refreshTokenToPersist),
      accessTokenExpiresAt: expiresAt,
      scopes:
        typeof json.scope === "string" && json.scope.length > 0
          ? json.scope.split(" ").filter((s) => s.length > 0)
          : [],
    };
  },

  async revoke(_token: string): Promise<void> {
    // Deferred to the uniform disconnect-UX slice — matches every other
    // V2 provider.
  },
};
