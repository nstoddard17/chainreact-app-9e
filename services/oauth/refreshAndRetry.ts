import { RefreshNotSupportedError } from "@/contracts/integration";
import { isPersonalCredentialProvider } from "@/core/integrations/credentialSharing";
import { decryptToken } from "@/core/encryption/tokens";
import {
  getActiveForExecution,
  type IntegrationRecord,
} from "@/repositories/integrations";
import { refresh as dispatcherRefresh } from "@/services/oauth/dispatcher";
import { getCredentialResolutionContext } from "@/services/oauth/credentialResolutionContext";

/**
 * Reactive refresh-and-retry wrapper.
 *
 * Per docs/rules/oauth-dispatcher.md §"Allowed flows" — handlers wrap their
 * principal outbound call in this helper so a 401 triggers exactly one
 * refresh + retry cycle. Adopted by Slice 2c's Gmail handler; existing
 * Slack handlers are unaffected (Slack tokens don't expire by default).
 *
 * Placement: lives in `services/oauth/` co-located with `state.ts`,
 * `dispatcher.ts`, and `refreshLock.ts`. The whole-codebase rule
 * (project-structure-and-module-boundaries.md §4) restricts `core/` to
 * imports from `contracts/` only, and this wrapper orchestrates the
 * repository + dispatcher + encryption — so it cannot satisfy `core/`'s
 * purity constraint.
 *
 * Contract (Slice 2 plan, decisions 2b-2 + 2b-3):
 *   - Caller's `apiCall` is opaque from this layer's perspective. It must
 *     throw `Unauthorized401Error` exactly when the provider returned
 *     HTTP 401. Any other error propagates untouched (network failures,
 *     4xx/5xx other than 401, application errors all bypass the refresh
 *     path — refresh fixes only auth, not other failures).
 *   - This wrapper owns the integration lookup AND token decryption. The
 *     handler hands over `(userId, provider, accountId?)` and an
 *     `apiCall(accessToken)` callback; the wrapper threads the live token
 *     into each invocation. The "stale closed-over token after refresh"
 *     bug is impossible by construction.
 *   - Exactly one retry. A second 401 surfaces as
 *     `IntegrationActionRequiredError({ reason: "refresh_failed" })` —
 *     refresh succeeded but the new token is still rejected, which means
 *     scope, account, or downstream state needs human attention.
 *
 * Concurrent 401s for the same integration coalesce via the dispatcher's
 * in-process refresh lock (`services/oauth/refreshLock.ts`): only one
 * provider refresh fires; all waiters share the result and retry with
 * the same new token.
 */

/**
 * Thrown by handler-level API wrappers when the provider returned HTTP 401.
 * The wrapper's only "this is an auth-expired error" signal — any other
 * error class indicates a non-auth failure that refresh wouldn't fix.
 */
export class Unauthorized401Error extends Error {
  constructor(message?: string) {
    super(message ?? "Provider returned HTTP 401 (Unauthorized).");
    this.name = "Unauthorized401Error";
  }
}

/**
 * Thrown by handler-level API wrappers when the provider returned HTTP 403
 * because the stored token LACKS A REQUIRED SCOPE (e.g. Google
 * `ACCESS_TOKEN_SCOPE_INSUFFICIENT` / `insufficientPermissions`, HubSpot
 * `MISSING_SCOPES`). Distinct from `Unauthorized401Error` on purpose: a token
 * refresh keeps the SAME granted scopes, so refreshing cannot fix a missing
 * scope — the user must re-consent (reconnect). `refreshAndRetry` does NOT
 * catch this (only 401 enters the refresh path), so it propagates verbatim to
 * the caller, where option resolvers map it to `PROVIDER_REAUTH_REQUIRED`
 * (the same reconnect UX Slack's `missing_scope` already produces). This is
 * the canonical "old token predates a newly-required manifest scope" signal.
 */
export class InsufficientScopeError extends Error {
  readonly provider: string | undefined;
  constructor(message?: string, provider?: string) {
    super(message ?? "Provider returned HTTP 403 (insufficient scope).");
    this.name = "InsufficientScopeError";
    this.provider = provider;
  }
}

export type IntegrationActionRequiredReason =
  | "refresh_not_supported"
  | "refresh_failed";

/**
 * Surfaced when refresh-and-retry concludes the integration needs human
 * action — either the provider doesn't support refresh at all (Slack v2,
 * Discord, GitHub Apps with offline tokens) or refresh succeeded but the
 * subsequent retry still got 401 (scope shrunk, account changed, etc.).
 *
 * Slice 2b defines the class; the future health-engine listener catches
 * it and emits an `action_required` health signal. Today, the run fails
 * with this error and the workflow's error_classification carries the
 * reason forward to the user-facing notification.
 */
export class IntegrationActionRequiredError extends Error {
  readonly accountId: string;
  readonly provider: string;
  readonly providerAccountId: string | null;
  readonly reason: IntegrationActionRequiredReason;

  constructor(input: {
    accountId: string;
    provider: string;
    providerAccountId: string | null;
    reason: IntegrationActionRequiredReason;
    cause?: unknown;
  }) {
    super(
      `Integration action required: ${input.reason} (account=${input.accountId}, provider=${input.provider}${
        input.providerAccountId !== null
          ? `, provider-account=${input.providerAccountId}`
          : ""
      }).`,
      input.cause !== undefined ? { cause: input.cause } : undefined,
    );
    this.name = "IntegrationActionRequiredError";
    this.accountId = input.accountId;
    this.provider = input.provider;
    this.providerAccountId = input.providerAccountId;
    this.reason = input.reason;
  }
}

export interface RefreshAndRetryInput<T> {
  /** V2 account that owns the integration (post 4.ACCOUNT-MODEL-6 cutover). */
  accountId: string;
  provider: string;
  /**
   * Provider-side account discriminator (Slack team_id, Gmail mailbox,
   * etc.); null if not applicable.
   */
  providerAccountId?: string | null;
  /**
   * The principal outbound call. Receives the current decrypted access
   * token. Must throw `Unauthorized401Error` on HTTP 401; other errors
   * propagate to the caller without triggering refresh.
   */
  apiCall: (accessToken: string) => Promise<T>;
  /**
   * Slice 3.SEC-14 — optional provider-policy preflight hook.
   *
   * Invoked AFTER the initial integration lookup but BEFORE the first
   * `apiCall`. Used by provider-specific policy gates (Stripe livemode
   * enforcement; future destructive-action confirmation gates). If
   * the preflight throws, no apiCall happens — the throw propagates
   * verbatim to the caller, and refresh-and-retry never enters the
   * 401 path. The preflight is invoked EXACTLY ONCE per
   * `refreshAndRetry` call, with the initial integration row; the
   * post-refresh refetch does NOT re-invoke it (refresh rotates only
   * the access token, never the account_metadata jsonb that the
   * policy reads).
   *
   * Synchronous by design — the existing provider policies (Stripe
   * livemode) need no I/O. Async preflights would broaden the cost
   * model without a current consumer.
   */
  preflight?: (integration: IntegrationRecord) => void;
}

/**
 * Runs `apiCall` with the current access token. On 401, refreshes the
 * integration via the dispatcher and retries `apiCall` exactly once with
 * the new token. Returns the apiCall's value.
 *
 * Throws:
 *   - `IntegrationActionRequiredError` (reason "refresh_not_supported")
 *     when the provider's `refreshToken()` throws `RefreshNotSupportedError`.
 *   - `IntegrationActionRequiredError` (reason "refresh_failed") when the
 *     refresh itself throws any other error, OR when the post-refresh
 *     retry also returns 401.
 *   - Any non-401 error from `apiCall` — propagated verbatim.
 *   - `Error("No active integration ...")` when the integration row is
 *     missing at lookup time.
 */
export async function refreshAndRetry<T>(input: RefreshAndRetryInput<T>): Promise<T> {
  if (!input.accountId) throw new Error("refreshAndRetry: accountId is required.");
  if (!input.provider) throw new Error("refreshAndRetry: provider is required.");

  const providerAccountId = input.providerAccountId ?? null;

  // Personal-credential provenance pin (Slice 4.ACCOUNT-MODEL-22B). For PERSONAL
  // providers, the engine-set context names the only user whose credential this
  // run may use (the workflow's created_by_user_id). Account/service providers
  // are NOT pinned (account-shared). No context (non-engine caller / unit test)
  // → no pin → pre-22B account-scoped behavior.
  const connectedByUserId = isPersonalCredentialProvider(input.provider)
    ? (getCredentialResolutionContext()?.createdByUserId ?? null)
    : null;
  const lookupOpts =
    connectedByUserId !== null ? { connectedByUserId } : undefined;

  // First attempt — fetch current row, decrypt access token, run apiCall.
  const initialRow = await getActiveForExecution(
    input.accountId,
    input.provider,
    providerAccountId,
    lookupOpts,
  );
  if (!initialRow) {
    // Pinned + missing = the workflow owner hasn't connected this personal
    // provider. NEVER fall back to a co-member's credential — fail with a
    // clear connect-required message.
    if (connectedByUserId !== null) {
      throw new Error(
        `refreshAndRetry: the workflow owner has no active ${input.provider} connection. Connect ${input.provider} to run this workflow.`,
      );
    }
    throw new Error(
      `refreshAndRetry: no active integration for account ${input.accountId} provider ${input.provider}${
        providerAccountId !== null ? ` provider-account ${providerAccountId}` : ""
      }.`,
    );
  }

  // Slice 3.SEC-14 — provider-policy preflight (Stripe livemode, etc.).
  // Runs once on the initial row; if it throws, no apiCall fires and
  // we never enter the refresh path. The throw propagates verbatim.
  if (input.preflight) {
    input.preflight(initialRow);
  }

  const initialToken = decryptToken(initialRow.accessTokenEncrypted);
  try {
    return await input.apiCall(initialToken);
  } catch (err) {
    if (!(err instanceof Unauthorized401Error)) {
      throw err;
    }
    // Fall through to refresh+retry.
  }

  // Refresh — pinned to the same connector so we refresh the SAME row the
  // apiCall used (not a co-member's row that shares the provider).
  try {
    await dispatcherRefresh({
      accountId: input.accountId,
      provider: input.provider,
      providerAccountId,
      connectedByUserId,
    });
  } catch (refreshErr) {
    if (refreshErr instanceof RefreshNotSupportedError) {
      throw new IntegrationActionRequiredError({
        accountId: input.accountId,
        provider: input.provider,
        providerAccountId,
        reason: "refresh_not_supported",
        cause: refreshErr,
      });
    }
    throw new IntegrationActionRequiredError({
      accountId: input.accountId,
      provider: input.provider,
      providerAccountId,
      reason: "refresh_failed",
      cause: refreshErr,
    });
  }

  // Refresh succeeded — refetch row to read the new access token (same pin).
  const refreshedRow = await getActiveForExecution(
    input.accountId,
    input.provider,
    providerAccountId,
    lookupOpts,
  );
  if (!refreshedRow) {
    throw new Error(
      `refreshAndRetry: integration disappeared between refresh and retry (account ${input.accountId} provider ${input.provider}).`,
    );
  }

  const newToken = decryptToken(refreshedRow.accessTokenEncrypted);
  try {
    return await input.apiCall(newToken);
  } catch (retryErr) {
    if (retryErr instanceof Unauthorized401Error) {
      // Refresh succeeded but the new token is still rejected — the
      // integration genuinely needs user action (scope shrunk, account
      // moved, provider-side revoke, etc.).
      throw new IntegrationActionRequiredError({
        accountId: input.accountId,
        provider: input.provider,
        providerAccountId,
        reason: "refresh_failed",
        cause: retryErr,
      });
    }
    throw retryErr;
  }
}
