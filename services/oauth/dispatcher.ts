import {
  type AccountSteer,
  DIRECT_TOKEN_AUTH_FLOWS,
  type EncryptedTokens,
  type ProviderHint,
  type ProviderOAuth,
  type ProviderTokenIngestAuth,
  RefreshAuthRequiredError,
  TokenIngestVerificationError,
} from "@/contracts/integration";
import { decryptToken } from "@/core/encryption/tokens";
import { airtableOAuth } from "@/integrations/airtable/oauth";
import { asanaOAuth } from "@/integrations/asana/oauth";
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
import { microsoftPowerBiOAuth } from "@/integrations/microsoft-powerbi/oauth";
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
import { edenAuth } from "@/integrations/eden/auth";
import { calendlyOAuth } from "@/integrations/calendly/oauth";
import { typeformOAuth } from "@/integrations/typeform/oauth";
import { quickbooksOAuth } from "@/integrations/quickbooks/oauth";
import { motiveOAuth } from "@/integrations/motive/oauth";
import {
  getActiveForExecution,
  getByIdForAccountServiceRole,
  updateTokens,
  upsertActive,
  clearNeedsReconnect,
  markNeedsReconnect,
  type IntegrationRecord,
} from "@/repositories/integrations";
import { notifyReconnectNeeded } from "@/services/integrations/reconnectNotification";
import { isMemberServiceRole, getRoleServiceRole } from "@/repositories/accountMemberships";
import { assertAccountOperational } from "@/services/accounts/accountFreeze";
import { isAccountCredentialProvider } from "@/core/integrations/credentialSharing";
import { refreshLockKey, withRefreshLock } from "./refreshLock";
import { createState, consumeState, InvalidStateError, type OAuthStatePayload } from "./state";

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
  "microsoft-powerbi": microsoftPowerBiOAuth,
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
  // Slice 5.ASANA-1 — Asana OAuth. Refreshable (hourly access tokens +
  // long-lived refresh token, preserve-old rotation policy), body-auth,
  // PKCE S256. Identity from the token response's embedded `data` object
  // (GET /users/me fallback). See integrations/asana/oauth.ts.
  asana: asanaOAuth,
  // Slice 5.TYPEFORM-1 — Typeform OAuth. Refreshable (~weekly access
  // tokens + ROTATING refresh tokens via the `offline` scope — the
  // rotated token is persisted on every refresh), body-auth, NO PKCE
  // (undocumented by Typeform). Identity from GET /me (accounts:read).
  // See integrations/typeform/oauth.ts.
  typeform: typeformOAuth,
  // Slice 5.CALENDLY-1 — Calendly OAuth. Refreshable (2-hour access
  // tokens + SINGLE-USE ROTATING refresh tokens — the rotated token is
  // persisted on every refresh), PKCE S256 (directed for all Calendly
  // app types) + Basic-auth token exchange (documented web-client
  // shape). Identity from GET /users/me (users:read); the token
  // response's owner/organization URIs are persisted into account
  // metadata for webhook-subscription creation.
  // See integrations/calendly/oauth.ts.
  calendly: calendlyOAuth,
  // QUICKBOOKS-1 — QuickBooks Online OAuth. Refreshable (60-min access
  // tokens + ~daily-rotating refresh tokens on a rolling 100-day window —
  // the returned refresh token is persisted on every refresh), Basic-auth
  // token exchange, NO PKCE (undocumented by Intuit). Company identity
  // (`realmId`) arrives ONLY as a callback query param — read from the
  // dispatcher's generic `callbackParams` passthrough; connect FAILS
  // without it. See integrations/quickbooks/oauth.ts.
  quickbooks: quickbooksOAuth,
  // MOTIVE-1 — non-PKCE body-auth OAuth; companyId read from /v1/users/me at
  // connect (not a callback param), rotating single-use refresh tokens.
  motive: motiveOAuth,
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
    // Eden uses the `token_paste` variant (pasted `eden_pat_`), but shares the
    // same ProviderTokenIngestAuth server contract, so it lives in this registry.
    eden: edenAuth,
  });

export interface ConnectInput {
  userId: string;
  /**
   * The V2 account the new integration MUST be written to — resolved by the
   * connect ROUTE at connect-start from the user's ACTIVE account (the account
   * switcher), then bound into the signed state JWT so the callback writes to
   * exactly this account regardless of any active-account/session/cookie change
   * during the OAuth round trip. NEVER defaulted to the personal account here:
   * defaulting to personal was the OAUTH-ACCT-BIND bug (a connect started on a
   * Team account silently landed on Personal). In reconnect mode this is ignored
   * in favor of the already-authorized `reconnect.accountId` (the target row's
   * account). Required for the normal connect path.
   */
  accountId: string;
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
 * Thrown by `handleCallback` / `handleTokenIngest` when, at callback time, the
 * flow-initiating user (from the signed state) is NO LONGER a member of the
 * state-bound account — e.g. they were removed from the team between connect and
 * callback. No integration row is created or refreshed. The callback route maps
 * this to a stable, non-leaking code (`account_access_revoked`) — never the raw
 * account/user id. This is the membership half of the OAUTH-ACCT-BIND hardening:
 * the write target is the signed-state account, re-verified for live membership.
 */
export class StateAccountAccessError extends Error {
  constructor() {
    super("state account access revoked");
    this.name = "StateAccountAccessError";
  }
}

/**
 * V2-READY-48 — defense-in-depth ROLE re-check at OAuth COMPLETION time.
 *
 * Connect-start (APPS-PERM-1) requires owner/admin to START an account/service
 * connection (Slack / Stripe / Notion / Shopify / HubSpot / Mailchimp), and
 * reconnect-start requires it too. But a user could be downgraded owner/admin →
 * member BETWEEN connect and callback while STILL a member, so the membership
 * re-check (`isMemberServiceRole`) at completion would pass and let them complete
 * (create / overwrite) a SHARED org credential they may no longer manage.
 *
 * This re-verifies owner/admin at completion for ACCOUNT-shared providers only.
 * Personal providers stay open to any member (they connect their OWN identity),
 * exactly matching connect-start — and personal reconnect is additionally pinned
 * by `assertReconnectIdentityMatch` (only the identity-holder can re-authorize).
 *
 * Reads the role via service-role against the SIGNED-STATE (accountId, userId) —
 * never the current active account, never a callback session. On loss it fails
 * safe with `StateAccountAccessError` (the SAME no-leak surface as membership
 * loss — role-loss must not be distinguishable from member-removal), so the
 * provider token exchange + `upsertActive` never run. No state-format change.
 */
async function assertCompletionRole(payload: OAuthStatePayload): Promise<void> {
  if (!isAccountCredentialProvider(payload.provider)) return;
  const role = await getRoleServiceRole(payload.accountId, payload.userId);
  if (role !== "owner" && role !== "admin") {
    throw new StateAccountAccessError();
  }
}

/**
 * Thrown at connect time when a per-tenant provider (Shopify) is being
 * reconnected but the tenant hint (the shop domain) can't be derived from the
 * intended row — e.g. a corrupt row whose `provider_account_id` isn't a valid
 * shop domain (Slice 4.APPS-RECONNECT). The message is SAFE/generic — it never
 * echoes the stored shop/identity — so the connect route can surface it inline.
 */
export class ReconnectHintUnavailableError extends Error {
  constructor() {
    super(
      "This connection can’t be reconnected automatically. Remove it and connect again.",
    );
    this.name = "ReconnectHintUnavailableError";
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

  // OAUTH-ACCT-BIND fix: the target V2 account is resolved by the connect ROUTE
  // at connect-start from the user's ACTIVE account (the account switcher) and
  // passed in as `input.accountId` — it is bound into the signed state JWT below,
  // so the callback writes the integration to the account the user was actually
  // on. It is NOT defaulted to the personal account here (that default was the
  // bug: a connect started on a Team account silently landed on Personal). The
  // route enforces membership + freeze (via the active-account resolver) before calling
  // connect; the callback re-verifies both against the signed state.
  //
  // Slice 4.APPS-RECONNECT: in reconnect mode the target account is the intended
  // ROW's account (NOT the active account) — the connect route already resolved +
  // authorized it (membership + not-frozen) via the reconnect service, so we use
  // `input.reconnect.accountId`.
  const accountId = input.reconnect ? input.reconnect.accountId : input.accountId;
  if (!accountId) throw new Error("connect: accountId is required.");

  // Token-ingest providers (Slice 17+) take a parallel path. They receive
  // the token from the browser via URL fragment + client POST, not via a
  // server callback with `code` + `state`. The dispatcher still owns
  // state issuance — only the wire transport differs.
  if ((DIRECT_TOKEN_AUTH_FLOWS as readonly string[]).includes(manifest.authFlow)) {
    // `token_ingest` (fragment redirect) and `token_paste` (V2 paste form) share
    // this path: the dispatcher owns state issuance; `buildAuthUrl` returns the
    // URL the browser is sent to (the provider's authorize page for token_ingest,
    // or a V2-hosted paste page for token_paste). Neither accepts a providerHint.
    // Input validation (providerHint) FIRST — fails fast on bad input
    // regardless of server-side registry config. A misconfigured server
    // shouldn't mask a malformed client request.
    if (input.providerHint !== undefined) {
      throw new Error(
        `Provider '${input.provider}' (${manifest.authFlow}) does not accept providerHint.`,
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

  // The per-tenant hint actually used to build the authorize URL + bind into
  // state. Normal connects validate the CLIENT-supplied hint (Slice 12);
  // reconnects DERIVE it SERVER-SIDE from the intended row (Slice 4.APPS-RECONNECT)
  // and ignore any client hint — the client only ever sends the opaque row id.
  let effectiveProviderHint: ProviderHint | undefined;
  if (input.reconnect) {
    // Per-tenant provider (Shopify) reconnect: the authorize URL depends on the
    // tenant (shop), so reconstruct that hint from the row's identity that the
    // reconnect service already resolved. Generic providers (no
    // `validateProviderHint`) need no hint and skip this entirely.
    if (oauth.validateProviderHint) {
      const derived =
        oauth.deriveReconnectHint?.({
          providerAccountId: input.reconnect.expectedProviderAccountId,
        }) ?? null;
      // Underivable (corrupt row) → SAFE typed error; never the raw shop value.
      if (!derived) throw new ReconnectHintUnavailableError();
      effectiveProviderHint = derived;
    }
  } else if (input.providerHint !== undefined) {
    // Slice 12: validate the CLIENT-supplied hint BEFORE state creation so format
    // errors fail at the start of the flow. A hint passed to a provider without a
    // `validateProviderHint` hook is a programming error.
    if (!oauth.validateProviderHint) {
      throw new Error(
        `Provider '${input.provider}' does not accept providerHint inputs.`,
      );
    }
    oauth.validateProviderHint(input.providerHint);
    effectiveProviderHint = input.providerHint;
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
    ...(effectiveProviderHint !== undefined
      ? { providerHint: effectiveProviderHint }
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
    effectiveProviderHint ?? null,
    steer,
  );
  return { redirectUrl };
}

export interface HandleCallbackInput {
  provider: string;
  code: string;
  state: string;
  /**
   * QUICKBOOKS-1 — the provider-redirect's extra query params (minus
   * `code`/`state`), collected generically by the callback route. Forwarded
   * verbatim to the provider module's `handleCallback` 5th argument; the
   * dispatcher never inspects individual keys (zero provider-specific
   * logic). QuickBooks reads `realmId` from here — Intuit delivers the
   * company id ONLY as a callback query param.
   */
  callbackParams?: Readonly<Record<string, string>> | null;
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

  // OAUTH-ACCT-BIND hardening — re-verify the flow initiator is STILL a member of
  // the state-bound account at callback time (they could have been removed from a
  // team between connect and callback). The write target is ALWAYS the signed
  // state's accountId — never the current active account — so it cannot drift; we
  // only confirm the initiator still has access to it, else fail safe (no upsert).
  // Service-role read against the signed-state (userId, accountId); no callback
  // session is required, so cross-redirect cookie loss can't break a legit connect.
  if (!(await isMemberServiceRole(payload.accountId, payload.userId))) {
    throw new StateAccountAccessError();
  }
  // V2-READY-48 — re-check owner/admin at completion for account-shared providers
  // (defense-in-depth against a role downgrade between connect-start and callback).
  // Runs BEFORE the provider token exchange, so a downgraded user fetches no token.
  await assertCompletionRole(payload);

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
    input.callbackParams ?? null,
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
  if (!(DIRECT_TOKEN_AUTH_FLOWS as readonly string[]).includes(manifest.authFlow)) {
    throw new Error(
      `Provider '${input.provider}' does not use a direct-token (token_ingest/token_paste) auth flow.`,
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

  // OAUTH-ACCT-BIND hardening (token-ingest parity with handleCallback): refuse to
  // persist to a frozen state-bound account, and re-verify the initiator is still
  // a member of it. The write target is the signed-state accountId, never the
  // current active account.
  await assertAccountOperational(payload.accountId);
  if (!(await isMemberServiceRole(payload.accountId, payload.userId))) {
    throw new StateAccountAccessError();
  }
  // V2-READY-48 — token-ingest parity: re-check owner/admin at completion for
  // account-shared providers. Runs BEFORE the provider verify call, so a
  // downgraded user's token is never sent to the provider and nothing is upserted.
  await assertCompletionRole(payload);

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
    // error. We don't catch GENERIC errors — callers (refreshAndRetry) own the
    // translation to IntegrationActionRequiredError(refresh_failed).
    //
    // V2-READY-32 EXCEPTION — a typed RefreshAuthRequiredError means the refresh
    // GRANT itself is dead (OAuth2 invalid_grant: revoked / expired / consent
    // withdrawn), which only user re-authorization can fix. Set
    // needs_reconnect_at + notify the connector once, then RE-THROW so the run
    // still fails with the existing refresh_failed semantics. Best-effort: the
    // signal write runs inside the single-flight lock (concurrent 401s already
    // collapse to one refresh) and markNeedsReconnect's conditional UPDATE makes
    // the notify one-shot; a signal-write failure must NEVER mask the refresh
    // failure. Transient/config errors stay generic here → no reconnect mark.
    let newTokens: EncryptedTokens;
    try {
      newTokens = await oauth.refreshToken(refreshTokenPlaintext);
    } catch (err) {
      if (err instanceof RefreshAuthRequiredError) {
        try {
          const firstMark = await markNeedsReconnect(row.id);
          if (firstMark) await notifyReconnectNeeded(row);
        } catch {
          // swallow — surfacing the original refresh failure matters more.
        }
      }
      throw err;
    }
    const integration = await updateTokens({ id: row.id, tokens: newTokens });

    // V2-READY-31 — a successful refresh proves the stored credential is still
    // alive. If this row carried a prior reconnect-needed signal (e.g. an
    // option-source PROVIDER_REAUTH_REQUIRED marked it before the access token
    // was refreshed), clear it now. Only writes when a signal exists, and is
    // best-effort: a clear failure must NEVER fail the refresh (the refresh
    // itself succeeded; a stale signal self-clears on the next successful
    // option load / refresh). Mirrors the conditional clears in
    // resolveOptionsSource + slackHealthCheck + the upsertActive reconnect path.
    if (row.needsReconnectAt != null) {
      try {
        await clearNeedsReconnect(row.id);
      } catch {
        // swallow — refresh succeeded; do not surface a clear-side failure.
      }
    }
    return { integration };
  });
}
