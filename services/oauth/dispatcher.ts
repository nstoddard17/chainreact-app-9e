import {
  type ProviderHint,
  type ProviderOAuth,
  type ProviderTokenIngestAuth,
  TokenIngestVerificationError,
} from "@/contracts/integration";
import { decryptToken } from "@/core/encryption/tokens";
import { airtableOAuth } from "@/integrations/airtable/oauth";
import { githubOAuth } from "@/integrations/github/oauth";
import { gmailOAuth } from "@/integrations/gmail/oauth";
import { googleCalendarOAuth } from "@/integrations/google-calendar/oauth";
import { googleDriveOAuth } from "@/integrations/google-drive/oauth";
import { googleSheetsOAuth } from "@/integrations/google-sheets/oauth";
import { hubspotOAuth } from "@/integrations/hubspot/oauth";
import { mailchimpOAuth } from "@/integrations/mailchimp/oauth";
import { microsoftExcelOAuth } from "@/integrations/microsoft-excel/oauth";
import { microsoftOneDriveOAuth } from "@/integrations/microsoft-onedrive/oauth";
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
  updateTokens,
  upsertActive,
  type IntegrationRecord,
} from "@/repositories/integrations";
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
  "google-calendar": googleCalendarOAuth,
  "google-drive": googleDriveOAuth,
  "google-sheets": googleSheetsOAuth,
  "microsoft-outlook": microsoftOutlookOAuth,
  "microsoft-outlook-calendar": microsoftOutlookCalendarOAuth,
  "microsoft-onedrive": microsoftOneDriveOAuth,
  "microsoft-excel": microsoftExcelOAuth,
  "microsoft-teams": microsoftTeamsOAuth,
  notion: notionOAuth,
  airtable: airtableOAuth,
  stripe: stripeOAuth,
  shopify: shopifyOAuth,
  hubspot: hubspotOAuth,
  github: githubOAuth,
  mailchimp: mailchimpOAuth,
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
      provider: input.provider,
      requestedScopes,
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
  });
  const redirectUrl = oauth.buildAuthUrl(
    state,
    requestedScopes,
    pkceGen !== undefined
      ? { codeChallenge: pkceGen.codeChallenge, codeChallengeMethod: pkceGen.codeChallengeMethod }
      : null,
    input.providerHint ?? null,
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

  const integration = await upsertActive({
    userId: payload.userId,
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

  const integration = await upsertActive({
    userId: payload.userId,
    provider: input.provider,
    providerAccountId: account.providerAccountId,
    displayName: account.displayName,
    tokens,
    accountMetadata: account.metadata,
  });

  return { integration };
}

export interface RefreshInput {
  userId: string;
  provider: string;
  /**
   * Optional account discriminator for multi-account users (Slack
   * workspaces, multiple Gmail inboxes). When omitted and the user has a
   * single active row for the provider, that row is refreshed; when
   * multiple active rows exist, the repository's lookup picks one
   * arbitrarily — callers with multi-account users SHOULD pass an
   * accountId to disambiguate.
   */
  accountId?: string | null;
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
  if (!input.userId) throw new Error("refresh: userId is required.");
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

  const accountId = input.accountId ?? null;
  const lockKey = refreshLockKey({
    userId: input.userId,
    provider: input.provider,
    accountId,
  });

  return withRefreshLock(lockKey, async () => {
    const row = await getActiveForExecution(input.userId, input.provider, accountId);
    if (!row) {
      throw new Error(
        `refresh: no active integration found for user ${input.userId} provider ${input.provider}${
          accountId !== null ? ` account ${accountId}` : ""
        }.`,
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
