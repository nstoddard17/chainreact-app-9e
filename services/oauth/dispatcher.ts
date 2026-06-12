import {
  type AccountSteer,
  type ProviderHint,
  type ProviderOAuth,
  type ProviderTokenIngestAuth,
  TokenIngestVerificationError,
} from "@/contracts/integration";
import { decryptToken } from "@/core/encryption/tokens";
import { airtableOAuth } from "@/integrations/airtable/oauth";
import { discordOAuth } from "@/integrations/discord/oauth";
import { dropboxOAuth } from "@/integrations/dropbox/oauth";
import { facebookOAuth } from "@/integrations/facebook/oauth";
import { githubOAuth } from "@/integrations/github/oauth";
import { gmailOAuth } from "@/integrations/gmail/oauth";
import { googleAnalyticsOAuth } from "@/integrations/google-analytics/oauth";
import { googleCalendarOAuth } from "@/integrations/google-calendar/oauth";
import { googleDocsOAuth } from "@/integrations/google-docs/oauth";
import { googleDriveOAuth } from "@/integrations/google-drive/oauth";
import { googleSheetsOAuth } from "@/integrations/google-sheets/oauth";
import { hubspotOAuth } from "@/integrations/hubspot/oauth";
import { mailchimpOAuth } from "@/integrations/mailchimp/oauth";
import { mondayOAuth } from "@/integrations/monday/oauth";
import { microsoftExcelOAuth } from "@/integrations/microsoft-excel/oauth";
import { microsoftOneDriveOAuth } from "@/integrations/microsoft-onedrive/oauth";
import { microsoftOneNoteOAuth } from "@/integrations/microsoft-onenote/oauth";
import { microsoftOutlookOAuth } from "@/integrations/microsoft-outlook/oauth";
import { microsoftOutlookCalendarOAuth } from "@/integrations/microsoft-outlook-calendar/oauth";
import { microsoftTeamsOAuth } from "@/integrations/microsoft-teams/oauth";
import { notionOAuth } from "@/integrations/notion/oauth";
import { shopifyOAuth } from "@/integrations/shopify/oauth";
import { getProvider } from "@/integrations/_registry";
import { slackOAuth } from "@/integrations/slack/oauth";
import { stripeOAuth } from "@/integrations/stripe/oauth";
import { trelloAuth } from "@/integrations/trello/auth";
import {
  getActiveForExecution,
  getByIdForAccountServiceRole,
  updateTokens,
  upsertActive,
  type IntegrationRecord,
} from "@/repositories/integrations";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import {
  AccountFrozenError,
  assertAccountOperational,
} from "@/services/accounts/accountFreeze";
import { refreshLockKey, withRefreshLock } from "./refreshLock";
import { createState, consumeState, InvalidStateError } from "./state";

/**
 * Generic OAuth dispatcher.
 *
 * Per docs/rules/oauth-dispatcher.md: zero provider-specific logic lives here.
 * Each provider in `integrations/<id>/oauth.ts` implements ProviderOAuth and is
 * registered in OAUTH_BY_PROVIDER below (hand-maintained per the registry rule
 * — explicit imports surface in PRs).
 */

const OAUTH_BY_PROVIDER: Readonly<Record<string, ProviderOAuth>> = Object.freeze({
  slack: slackOAuth,
  gmail: gmailOAuth,
  // Slice 3.GOOGLE-ANALYTICS-2 — GA4 OAuth. Refreshable, PKCE S256,
  // OIDC-userinfo account identity. Reuses the shared Google OAuth helpers
  // (same as Docs / Sheets / Drive / Calendar / Gmail).
  "google-analytics": googleAnalyticsOAuth,
  "google-calendar": googleCalendarOAuth,
  "google-docs": googleDocsOAuth,
  "google-drive": googleDriveOAuth,
  "google-sheets": googleSheetsOAuth,
  "microsoft-outlook": microsoftOutlookOAuth,
  "microsoft-outlook-calendar": microsoftOutlookCalendarOAuth,
  "microsoft-onedrive": microsoftOneDriveOAuth,
  "microsoft-onenote": microsoftOneNoteOAuth,
  "microsoft-excel": microsoftExcelOAuth,
  "microsoft-teams": microsoftTeamsOAuth,
  notion: notionOAuth,
  airtable: airtableOAuth,
  stripe: stripeOAuth,
  shopify: shopifyOAuth,
  hubspot: hubspotOAuth,
  github: githubOAuth,
  mailchimp: mailchimpOAuth,
  // Slice 3.MONDAY-2 — Monday.com OAuth. Refreshable, body-auth, no
  // PKCE. Mirrors HubSpot's wire-format shape. See
  // integrations/monday/oauth.ts for the per-provider details.
  monday: mondayOAuth,
  // Slice 3.DISCORD-2 — Discord identity OAuth. Refreshable (Discord
  // issues refresh tokens for user identity flows); bot install is a
  // side-effect of the inline `bot` scope picker on Discord's
  // authorize page. The deployment-level DISCORD_BOT_TOKEN env is
  // owned by integrations/_shared/discord/api/_base.ts and is NOT
  // touched by this OAuth implementation.
  discord: discordOAuth,
  // Slice 3.DROPBOX-2 — Dropbox OAuth. Refreshable (token_access_type=
  // offline), body-auth, no PKCE. See integrations/dropbox/oauth.ts.
  dropbox: dropboxOAuth,
  // Slice 3.FACEBOOK-2 — Facebook OAuth. NOT refreshable (long-lived
  // user token via fb_exchange_token, no refresh token); page tokens
  // derived at runtime. See integrations/facebook/oauth.ts.
  facebook: facebookOAuth,
});

/**
 * Per-provider token-ingest registry. Empty at contract-introduction
 * time; populated as each token-ingest provider lands (Trello first).
 *
 * Parallel to `OAUTH_BY_PROVIDER` — the dispatcher's `connect()` branches
 * on `manifest.authFlow` to decide which registry to consult.
 */
const TOKEN_INGEST_BY_PROVIDER: Readonly<Record<string, ProviderTokenIngestAuth>> =
  Object.freeze({
    trello: trelloAuth,
  });

export interface ConnectInput {
  userId: string;
  provider: string;
  /**
   * Optional per-tenant provider hint (Slice 12). Set by the connect
   * route from the request body for providers whose OAuth URL depends
   * on user input (Shopify shop subdomain). The dispatcher validates
   * the hint via the per-provider `validateProviderHint` hook BEFORE
   * creating state, then binds it into the JWT payload AND forwards it
   * to `buildAuthUrl`. Non-tenant providers omit the field; passing a
   * hint to a provider that didn't declare `validateProviderHint`
   * raises a typed error.
   */
  providerHint?: ProviderHint;
  /**
   * Per-account reconnect intent (Slice 4.APPS-RECONNECT). Set ONLY by the
   * connect route AFTER the reconnect service has resolved + authorized the
   * target row (account scope + membership/connector + not-frozen). When present:
   *   - the OAuth flow writes to `accountId` (the row's account, NOT the personal
   *     floor) and the bound state carries the opaque `integrationId`;
   *   - Google/Microsoft sign-in is steered to `expectedProviderAccountId` (the
   *     row's email) via `login_hint` + force-account-selection;
   *   - the callback refuses to upsert unless the provider-returned identity
   *     matches that row (see `ReconnectIdentityMismatchError`).
   * The route is responsible for authorization; the dispatcher trusts the
   * already-vetted values. Normal Connect / Connect-another omit this.
   */
  reconnect?: {
    integrationId: string;
    accountId: string;
    expectedProviderAccountId: string;
  };
}

/**
 * Thrown by `handleCallback` / `handleTokenIngest` when a per-account reconnect
 * authorized a DIFFERENT external identity than the row it targeted (e.g. the
 * user picked the wrong mailbox at Google's chooser). No row is created or
 * refreshed. The callback route maps this to a stable, non-leaking status code
 * (`reconnect_account_mismatch`) — never the raw provider identity.
 */
export class ReconnectIdentityMismatchError extends Error {
  constructor() {
    super("reconnect identity mismatch");
    this.name = "ReconnectIdentityMismatchError";
  }
}

/**
 * Shared reconnect guard (Slice 4.APPS-RECONNECT) used by both callback paths.
 * When the consumed state carried a reconnect intent, load the intended row
 * (account-scoped, service-role) and require the provider-returned identity to
 * match its stored `provider_account_id`. On any mismatch / missing row, throw
 * — the caller MUST NOT upsert. No identity value is logged or surfaced.
 */
async function assertReconnectIdentityMatch(
  payload: { accountId: string; reconnect?: { integrationId: string } },
  authorizedProviderAccountId: string,
): Promise<void> {
  if (!payload.reconnect) return;
  const row = await getByIdForAccountServiceRole(
    payload.accountId,
    payload.reconnect.integrationId,
  );
  if (!row || row.providerAccountId !== authorizedProviderAccountId) {
    throw new ReconnectIdentityMismatchError();
  }
}

export interface ConnectOutput {
  redirectUrl: string;
}

export async function connect(input: ConnectInput): Promise<ConnectOutput> {
  if (!input.userId) throw new Error("connect: userId is required.");
  const manifest = getProvider(input.provider);
  if (!manifest) throw new Error(`Unknown provider: ${input.provider}`);
  if (!manifest.isEnabled) throw new Error(`Provider '${input.provider}' is disabled.`);
  if (!manifest.capabilities.oauth) {
    throw new Error(`Provider '${input.provider}' does not support OAuth.`);
  }

  // Slice 4.ACCOUNT-MODEL-6: resolve the target V2 account at connect
  // time and bind it into the signed state JWT. No active-account
  // switcher yet — default to the user's personal account. The future
  // switcher slice changes only what we resolve here (the active
  // account over personal-account fallback); the dispatcher contract
  // is unchanged.
  //
  // Slice 4.APPS-RECONNECT: in reconnect mode the target account is the
  // intended ROW's account (NOT the personal floor) — the connect route already
  // resolved + authorized it (membership + not-frozen) via the reconnect
  // service, so we trust `input.reconnect.accountId` and skip the personal-floor
  // resolution + freeze check here.
  let accountId: string;
  if (input.reconnect) {
    accountId = input.reconnect.accountId;
  } else {
    const ownerAccount = await ensurePersonalAccount(input.userId);
    accountId = ownerAccount.id;
    // 4.ACCOUNT-MODEL-10b — account freeze. A pending_deletion account cannot
    // connect new integrations. Checked on the already-resolved record (no extra
    // round trip) before any state JWT is minted.
    if (ownerAccount.deletionStatus === "pending_deletion") {
      throw new AccountFrozenError(accountId);
    }
  }

  // Token-ingest providers (Slice 17+) take a parallel path. They receive
  // the token from the browser via URL fragment + client POST, not via a
  // server callback with `code` + `state`. The dispatcher still owns
  // state issuance — only the wire transport differs.
  if (manifest.authFlow === "token_ingest") {
    // Input validation (providerHint) FIRST — fails fast on bad input
    // regardless of server-side registry config. A misconfigured server
    // shouldn't mask a malformed client request.
    if (input.providerHint !== undefined) {
      throw new Error(
        `Provider '${input.provider}' (token_ingest) does not accept providerHint.`,
      );
    }
    const ingestAuth = TOKEN_INGEST_BY_PROVIDER[input.provider];
    if (!ingestAuth) {
      throw new Error(
        `No token-ingest implementation registered for provider '${input.provider}'. Update services/oauth/dispatcher.ts.`,
      );
    }
    const requestedScopes = [...manifest.scopes.required, ...manifest.scopes.optional];
    const { token: state } = await createState({
      userId: input.userId,
      accountId,
      provider: input.provider,
      requestedScopes,
      // Reconnect intent rides into the token-ingest state too, so
      // `handleTokenIngest` enforces the same identity-match guard (no provider
      // sign-in to steer here, but the callback still refuses a wrong-row upsert).
      ...(input.reconnect !== undefined
        ? { reconnect: { integrationId: input.reconnect.integrationId } }
        : {}),
    });
    const redirectUrl = ingestAuth.buildAuthUrl(state, requestedScopes);
    return { redirectUrl };
  }

  const oauth = OAUTH_BY_PROVIDER[input.provider];
  if (!oauth) {
    throw new Error(
      `No OAuth implementation registered for provider '${input.provider}'. Update services/oauth/dispatcher.ts.`,
    );
  }

  // Slice 12: per-tenant providerHint validation. Runs BEFORE state
  // creation so format errors fail at the start of the flow rather
  // than at the callback (where the user has already authorized on
  // the provider's UI). A providerHint passed to a provider without a
  // `validateProviderHint` hook is a programming error — the only
  // providers expecting hints are the ones that declared the hook.
  if (input.providerHint !== undefined) {
    if (!oauth.validateProviderHint) {
      throw new Error(
        `Provider '${input.provider}' does not accept providerHint inputs.`,
      );
    }
    oauth.validateProviderHint(input.providerHint);
  }

  const requestedScopes = [...manifest.scopes.required, ...manifest.scopes.optional];

  // Provider-owned PKCE. Providers that need PKCE implement generatePkce
  // and the dispatcher routes the verifier to createState (persisted on
  // the oauth_states row) and the challenge into buildAuthUrl. Non-PKCE
  // providers (Slack default v2) omit generatePkce entirely → no PKCE
  // metadata flows anywhere.
  const pkceGen = oauth.generatePkce?.();
  const { token: state } = await createState({
    userId: input.userId,
    accountId,
    provider: input.provider,
    requestedScopes,
    ...(pkceGen !== undefined
      ? {
          pkce: {
            codeVerifier: pkceGen.codeVerifier,
            codeChallengeMethod: pkceGen.codeChallengeMethod,
          },
        }
      : {}),
    ...(input.providerHint !== undefined
      ? { providerHint: input.providerHint }
      : {}),
    ...(input.reconnect !== undefined
      ? { reconnect: { integrationId: input.reconnect.integrationId } }
      : {}),
  });
  // Slice 4.APPS-RECONNECT — steer the provider sign-in to the intended account
  // on reconnect. Only Google/Microsoft `buildAuthUrl` honor this; every other
  // provider ignores the 5th arg. The hard guarantee is the callback match, not
  // this hint.
  const steer: AccountSteer | null = input.reconnect
    ? { loginHint: input.reconnect.expectedProviderAccountId, forceAccountSelection: true }
    : null;
  const redirectUrl = oauth.buildAuthUrl(
    state,
    requestedScopes,
    pkceGen !== undefined
      ? { codeChallenge: pkceGen.codeChallenge, codeChallengeMethod: pkceGen.codeChallengeMethod }
      : null,
    input.providerHint ?? null,
    steer,
  );
  return { redirectUrl };
}

export interface HandleCallbackInput {
  provider: string;
  code: string;
  state: string;
}

export interface HandleCallbackOutput {
  integration: IntegrationRecord;
}

export async function handleCallback(
  input: HandleCallbackInput,
): Promise<HandleCallbackOutput> {
  // Verify-and-consume the state in one atomic step. consumeState does the
  // signature + expiry check AND deletes the matching oauth_states row; a
  // second callback with the same state throws InvalidStateError("already
  // consumed or expired") — that's the replay-protection layer that the JWT
  // alone cannot enforce. The route maps this exception to a redirect with
  // ?integration_error=...
  //
  // We consume BEFORE checking provider mismatch on purpose: a malformed
  // request (wrong provider in URL but valid state) still uses up the nonce
  // so it can't be replayed against the correct provider's route either.
  //
  // pkce is non-null only for providers whose connect path issued a PKCE
  // challenge (Gmail and future PKCE providers). Slack default v2 → null.
  // providerHint is non-null only for per-tenant providers (Slice 12 —
  // Shopify) whose connect path supplied a hint. Other providers → null.
  const { payload, pkce, providerHint } = await consumeState(input.state);
  if (payload.provider !== input.provider) {
    throw new InvalidStateError("provider mismatch between state and route");
  }

  // 4.ACCOUNT-MODEL-10b — account freeze. If the account entered
  // pending_deletion between connect and callback, refuse to persist the new
  // integration. Service-role status read (no session in the callback path).
  await assertAccountOperational(payload.accountId);

  const oauth = OAUTH_BY_PROVIDER[input.provider];
  if (!oauth) {
    throw new Error(
      `No OAuth implementation registered for provider '${input.provider}'.`,
    );
  }

  const { tokens, account } = await oauth.handleCallback(
    input.code,
    input.state,
    pkce,
    providerHint,
  );

  // Slice 4.APPS-RECONNECT — when this flow was a per-account reconnect, refuse
  // to persist unless the provider-returned identity matches the intended row.
  // Runs BEFORE upsert, so a wrong-account reconnect creates/refreshes nothing.
  await assertReconnectIdentityMatch(payload, account.providerAccountId);

  const integration = await upsertActive({
    accountId: payload.accountId,
    connectedByUserId: payload.userId,
    provider: input.provider,
    providerAccountId: account.providerAccountId,
    displayName: account.displayName,
    tokens,
    accountMetadata: account.metadata,
  });

  return { integration };
}

/**
 * Input for `handleTokenIngest` — the dispatcher operation that receives
 * a token captured by the V2 client ingest page (Slice 17 onwards).
 */
export interface HandleTokenIngestInput {
  userId: string;
  provider: string;
  state: string;
  token: string;
}

/**
 * Verify + persist a token-ingest provider's user token.
 *
 * Flow:
 *   1. Validate inputs.
 *   2. Look up the manifest; require `authFlow === "token_ingest"`.
 *   3. Look up the provider's ingest implementation.
 *   4. `consumeState(state)` — atomic JWT verify + DB delete-if-fresh.
 *      State is consumed BEFORE the verify call so a failed verify
 *      cannot leave a replayable state row behind.
 *   5. Cross-check the JWT payload's provider AND userId against the
 *      route-supplied values.
 *   6. Provider's `verifyAndIngestToken` — calls the provider API to
 *      confirm the token is valid AND fetches account info.
 *   7. `upsertActive` — same persistence path OAuth callbacks use.
 *
 * NEVER logs the `token` value at any point.
 */
export async function handleTokenIngest(
  input: HandleTokenIngestInput,
): Promise<HandleCallbackOutput> {
  if (!input.userId) throw new Error("handleTokenIngest: userId is required.");
  if (!input.state) throw new InvalidStateError("missing state");
  if (!input.token) {
    throw new TokenIngestVerificationError(input.provider, "missing token");
  }

  const manifest = getProvider(input.provider);
  if (!manifest) throw new Error(`Unknown provider: ${input.provider}`);
  if (manifest.authFlow !== "token_ingest") {
    throw new Error(
      `Provider '${input.provider}' does not use token_ingest auth.`,
    );
  }

  const ingestAuth = TOKEN_INGEST_BY_PROVIDER[input.provider];
  if (!ingestAuth) {
    throw new Error(
      `No token-ingest implementation registered for provider '${input.provider}'.`,
    );
  }

  const { payload } = await consumeState(input.state);
  if (payload.provider !== input.provider) {
    throw new InvalidStateError("provider mismatch between state and route");
  }
  if (payload.userId !== input.userId) {
    throw new InvalidStateError("session/state user mismatch");
  }

  const { tokens, account } = await ingestAuth.verifyAndIngestToken({
    token: input.token,
    state: input.state,
  });

  // Slice 4.APPS-RECONNECT — same identity-match guard on the token-ingest path.
  await assertReconnectIdentityMatch(payload, account.providerAccountId);

  const integration = await upsertActive({
    accountId: payload.accountId,
    connectedByUserId: payload.userId,
    provider: input.provider,
    providerAccountId: account.providerAccountId,
    displayName: account.displayName,
    tokens,
    accountMetadata: account.metadata,
  });

  return { integration };
}

/**
 * 4.ACCOUNT-MODEL-10c — best-effort provider token revocation for the purge
 * flow. Looks the provider up in BOTH registries (OAuth + token-ingest) and
 * calls its `revoke(token)`. Unknown providers (or providers whose `revoke` is
 * a no-op) simply do nothing. This function does NOT swallow errors — the
 * caller (purge service) owns the best-effort + bounded-retry policy so a
 * provider outage is logged/audited but never blocks deletion. NEVER logs the
 * token.
 */
export async function revokeProviderToken(
  provider: string,
  token: string,
): Promise<void> {
  const oauth = OAUTH_BY_PROVIDER[provider];
  if (oauth) {
    await oauth.revoke(token);
    return;
  }
  const ingest = TOKEN_INGEST_BY_PROVIDER[provider];
  if (ingest) {
    await ingest.revoke(token);
    return;
  }
  // Unknown provider — nothing to revoke. The local row is still deleted by the
  // purge teardown regardless.
}

export interface RefreshInput {
  /**
   * V2 account that owns the integration (post 4.ACCOUNT-MODEL-6
   * cutover). Replaces the pre-cutover `userId` keying.
   */
  accountId: string;
  provider: string;
  /**
   * Optional provider-side account discriminator for multi-account
   * setups within the same V2 account (e.g., two Slack workspaces
   * connected to one team account; multiple Gmail inboxes). When
   * omitted and the account has a single active row for the provider,
   * that row is refreshed; when multiple active rows exist, callers
   * SHOULD pass a `providerAccountId` to disambiguate.
   */
  providerAccountId?: string | null;
  /**
   * Provenance pin (Slice 4.ACCOUNT-MODEL-22B). When set, the row to refresh
   * is additionally filtered by `connected_by_user_id` — so a refresh targets
   * the SAME personal credential the apiCall resolved (never a co-member's
   * row that happens to share the provider). `refreshAndRetry` passes the
   * workflow creator's id for personal providers; account providers omit it.
   */
  connectedByUserId?: string | null;
}

export interface RefreshOutput {
  integration: IntegrationRecord;
}

/**
 * Refresh an integration's access token via the provider's refresh flow.
 *
 * Concurrent calls for the same `(userId, provider, accountId)` triple
 * collapse into one provider call via the in-process single-flight lock
 * (`services/oauth/refreshLock.ts`). All callers receive the same
 * `RefreshOutput`.
 *
 * Throws:
 *   - `RefreshNotSupportedError` (from the provider's `refreshToken()`)
 *     for non-refreshable providers (Slack default v2). The wrapper
 *     `services/oauth/refreshAndRetry.ts` catches and translates this
 *     into `IntegrationActionRequiredError`.
 *   - `Error("No active integration ...")` when the lookup returns null.
 *   - `Error("No refresh token stored ...")` when the row exists but its
 *     `refresh_token_encrypted` is null (provider was non-refreshable at
 *     connect time, or token has been wiped).
 *   - Any error the provider's `refreshToken()` throws (network, 4xx, 5xx).
 */
export async function refresh(input: RefreshInput): Promise<RefreshOutput> {
  if (!input.accountId) throw new Error("refresh: accountId is required.");
  // 4.ACCOUNT-MODEL-10b — account freeze. Token refresh-for-use is blocked for
  // a pending_deletion account: its integrations must not perform live work
  // during the grace window. Tokens are retained (revoke happens at purge, 10c)
  // but cannot be refreshed for use here.
  await assertAccountOperational(input.accountId);
  const manifest = getProvider(input.provider);
  if (!manifest) throw new Error(`Unknown provider: ${input.provider}`);
  if (!manifest.capabilities.oauth) {
    throw new Error(`Provider '${input.provider}' does not support OAuth.`);
  }

  const oauth = OAUTH_BY_PROVIDER[input.provider];
  if (!oauth) {
    throw new Error(
      `No OAuth implementation registered for provider '${input.provider}'.`,
    );
  }

  const providerAccountId = input.providerAccountId ?? null;
  const connectedByUserId = input.connectedByUserId ?? null;
  const lockKey = refreshLockKey({
    accountId: input.accountId,
    provider: input.provider,
    providerAccountId,
    connectedByUserId,
  });

  return withRefreshLock(lockKey, async () => {
    const row = await getActiveForExecution(
      input.accountId,
      input.provider,
      providerAccountId,
      connectedByUserId != null ? { connectedByUserId } : undefined,
    );
    if (!row) {
      throw new Error(
        `refresh: no active integration found for account ${input.accountId} provider ${input.provider}${
          providerAccountId !== null ? ` provider-account ${providerAccountId}` : ""
        }${connectedByUserId !== null ? ` connected-by ${connectedByUserId}` : ""}.`,
      );
    }
    if (!row.refreshTokenEncrypted) {
      throw new Error(
        `refresh: no refresh token stored on integration ${row.id} (provider ${input.provider}).`,
      );
    }
    const refreshTokenPlaintext = decryptToken(row.refreshTokenEncrypted);
    // Provider may throw RefreshNotSupportedError or any provider-specific
    // error. We don't catch — callers (refreshAndRetry) own the
    // translation to IntegrationActionRequiredError.
    const newTokens = await oauth.refreshToken(refreshTokenPlaintext);
    const integration = await updateTokens({ id: row.id, tokens: newTokens });
    return { integration };
  });
}
