import {
  listActiveByProviderServiceRole,
  markNeedsReconnect,
  clearNeedsReconnect,
  type IntegrationRecord,
} from "@/repositories/integrations";
import { authTest } from "@/integrations/slack/api/authTest";
import { SlackApiError, isSlackAuthError } from "@/integrations/slack/api/errors";
import { decryptToken } from "@/core/encryption/tokens";
import { notifyReconnectNeeded } from "@/services/integrations/reconnectNotification";
import { isIntegrationHealthCheckEnabled } from "@/services/integrations/integrationHealthFlags";
import { refreshWithClaim } from "@/services/oauth/refreshWithClaim";
import { RefreshAuthRequiredError } from "@/contracts/integration";

/**
 * V2-READY-29 — proactive Slack connection health check.
 *
 * WHY THIS EXISTS: a Slack row connected WITHOUT token rotation stores no
 * refresh token — a stale/revoked token there is only discovered REACTIVELY,
 * when a builder picker or an action 401s (V2-READY-28 marks reconnect-needed
 * at that point). This sweep moves detection EARLIER: it periodically probes
 * each active Slack connection with the lightweight `auth.test` endpoint and
 * drives the SAME existing mark/clear/notify path (V2-READY-28/28B) so a user
 * learns to reconnect before a workflow run fails. Rotation-enabled rows
 * (SLACK-TOKEN-ROTATION-1) instead self-heal via refresh — see
 * `refreshInsteadOfMark`.
 *
 * CLASSIFICATION (conservative — never cry wolf):
 *   - `auth.test` ok            → HEALTHY. Clear any prior `needs_reconnect_at`.
 *   - SlackApiError + isSlackAuthError(code) → CONFIRMED auth failure
 *       (invalid_auth / token_revoked / account_inactive / not_authed /
 *        token_expired / missing_scope / … / http_401 / http_403).
 *       SLACK-TOKEN-ROTATION-1: if the row stores a refresh token (rotation-
 *       enabled Slack app) and the code isn't `missing_scope`, attempt a
 *       refresh instead of marking (see `refreshInsteadOfMark`). Otherwise
 *       mark needs-reconnect; on a TRUE first-mark transition, notify once.
 *   - SlackApiError that is NOT an auth error (ratelimited / internal_error /
 *       http_429 / http_5xx / …) → TRANSIENT. Do nothing (skipped).
 *   - Any non-Slack throw (network, decrypt, DNS) → AMBIGUOUS. Do nothing
 *       (counted as `errors`, never marks).
 *
 * NO-LEAK: returns ONLY numeric aggregate counts. No token, team id, provider
 * account id, email, scope, display name, or raw provider body is returned or
 * logged. `auth.test` success body (which carries team_id/user_id) is discarded
 * by the wrapper. Per-row failures are logged with the (non-secret) Slack error
 * code + integration id only — same shape the option-source already logs.
 *
 * IDEMPOTENT + SAFE TO RE-RUN: clear/mark are conditional and keyed by row id;
 * re-running with no provider state change clears nothing new and marks nothing
 * new (the conditional UPDATE in `markNeedsReconnect` only transitions NULL →
 * set). One row's failure never aborts the batch (per-row try/catch +
 * Promise.allSettled).
 */

const PROVIDER = "slack";

/** Bounded concurrency — mirror the trigger crons (poll/renew). */
const CONCURRENCY = 5;

/** Aggregate, numbers only. Safe to log + return to the cron monitor. */
export interface SlackHealthCheckResult {
  /** Whether the feature flag was on (false ⇒ no-op, all other counts 0). */
  enabled: boolean;
  /** Active Slack rows processed this tick. */
  checked: number;
  /** Rows whose token `auth.test`-validated successfully. */
  healthy: number;
  /** Subset of `healthy` that had a prior signal we cleared. */
  cleared: number;
  /** Rows with a CONFIRMED auth failure (isSlackAuthError). */
  authFailed: number;
  /** Subset of `authFailed` newly marked (first-mark transition) → notified once. */
  markedNeedsReconnect: number;
  /** Rows with a TRANSIENT Slack failure (rate limit / 5xx) — no state change. */
  skipped: number;
  /** Rows that threw an unexpected (non-Slack) error — no state change. */
  errors: number;
}

export interface SlackHealthCheckInput {
  /** Max active rows to probe this tick. */
  limit: number;
}

type RowOutcome = "healthy" | "authFailed" | "skipped" | "errors";

interface RowResult {
  outcome: RowOutcome;
  /** healthy + cleared a prior signal. */
  cleared: boolean;
  /** authFailed + first-mark transition (notified). */
  newlyMarked: boolean;
}

async function checkOne(integration: IntegrationRecord): Promise<RowResult> {
  let botToken: string;
  try {
    botToken = decryptToken(integration.accessTokenEncrypted);
  } catch {
    // Decrypt failure is NOT a provider auth verdict — don't mark reconnect on
    // an app-side key/ciphertext problem. Count as an error and move on.
    logRow("slack_health.decrypt_error", integration.id, null);
    return { outcome: "errors", cleared: false, newlyMarked: false };
  }

  try {
    await authTest({ botToken });
    // HEALTHY — clear any stale signal (only when one is actually set, to avoid
    // a needless write). `needsReconnectAt` is optional/nullable on the record.
    if (integration.needsReconnectAt != null) {
      await clearNeedsReconnect(integration.id);
      return { outcome: "healthy", cleared: true, newlyMarked: false };
    }
    return { outcome: "healthy", cleared: false, newlyMarked: false };
  } catch (err) {
    if (err instanceof SlackApiError) {
      if (isSlackAuthError(err.slackErrorCode)) {
        // SLACK-TOKEN-ROTATION-1 — rotation-aware guard. A row that stores a
        // refresh token (rotation-enabled Slack app) with a dead ACCESS token
        // is REFRESHABLE, not reconnect-needed: marking it would remove it
        // from the proactive sweep (`needs_reconnect_at IS NULL` selection)
        // and strand a recoverable connection in a permanent reconnect loop.
        // Attempt the refresh instead; a truly dead GRANT surfaces as
        // RefreshAuthRequiredError, which the dispatcher already marks +
        // notifies (V2-READY-32). `missing_scope` is excluded — refresh keeps
        // the same scopes, so reconnect (re-consent) IS the fix there.
        if (
          integration.refreshTokenEncrypted != null &&
          err.slackErrorCode !== "missing_scope"
        ) {
          return refreshInsteadOfMark(integration, err.slackErrorCode);
        }
        // CONFIRMED auth failure → mark; notify once on first-mark transition.
        logRow("slack_health.auth_failure", integration.id, err.slackErrorCode);
        const firstMark = await markNeedsReconnect(integration.id);
        if (firstMark) {
          // Best-effort, never throws (mirrors the option-source call site).
          await notifyReconnectNeeded(integration);
        }
        return {
          outcome: "authFailed",
          cleared: false,
          newlyMarked: firstMark,
        };
      }
      // TRANSIENT Slack failure (ratelimited / internal_error / http_429 /
      // http_5xx) → never mark; a later tick re-checks.
      logRow("slack_health.transient", integration.id, err.slackErrorCode);
      return { outcome: "skipped", cleared: false, newlyMarked: false };
    }
    // Non-Slack throw (network / DNS / decode) — ambiguous, never mark.
    logRow("slack_health.unexpected_error", integration.id, null);
    return { outcome: "errors", cleared: false, newlyMarked: false };
  }
}

/**
 * SLACK-TOKEN-ROTATION-1 — refresh a rotation-enabled row whose access token
 * failed auth, instead of marking it reconnect-needed.
 *
 *   - Refresh succeeds → the row is HEALTHY again (new access token persisted
 *     by the dispatcher, which also clears any prior `needs_reconnect_at`).
 *   - RefreshAuthRequiredError → the refresh GRANT is dead; the dispatcher
 *     already marked needs_reconnect + notified once before re-throwing, so
 *     this is counted authFailed WITHOUT a second mark/notify here.
 *   - Anything else (network / 5xx / claim wait budget) → TRANSIENT; no state
 *     change, a later tick re-checks.
 *
 * Slack is an account-shared provider, so the claim key is unpinned
 * (`connectedByUserId: null`) — same key shape the sweep and refreshAndRetry
 * use for account providers.
 */
async function refreshInsteadOfMark(
  integration: IntegrationRecord,
  slackErrorCode: string,
): Promise<RowResult> {
  try {
    await refreshWithClaim({
      accountId: integration.accountId,
      provider: PROVIDER,
      providerAccountId: integration.providerAccountId,
      connectedByUserId: null,
    });
    logRow("slack_health.refreshed", integration.id, slackErrorCode);
    return {
      outcome: "healthy",
      cleared: integration.needsReconnectAt != null,
      newlyMarked: false,
    };
  } catch (err) {
    if (err instanceof RefreshAuthRequiredError) {
      // Dispatcher marked + notified (one-shot) before re-throwing.
      logRow("slack_health.refresh_auth_dead", integration.id, err.code);
      return { outcome: "authFailed", cleared: false, newlyMarked: false };
    }
    logRow("slack_health.refresh_transient", integration.id, slackErrorCode);
    return { outcome: "skipped", cleared: false, newlyMarked: false };
  }
}

/** Sanitized per-row log: event + integration id + (non-secret) Slack code only. */
function logRow(event: string, integrationId: string, slackErrorCode: string | null): void {
  console.warn(
    JSON.stringify(
      slackErrorCode === null
        ? { event, integrationId }
        : { event, integrationId, slackErrorCode },
    ),
  );
}

export async function runSlackHealthCheck(
  input: SlackHealthCheckInput,
): Promise<SlackHealthCheckResult> {
  const empty: SlackHealthCheckResult = {
    enabled: false,
    checked: 0,
    healthy: 0,
    cleared: 0,
    authFailed: 0,
    markedNeedsReconnect: 0,
    skipped: 0,
    errors: 0,
  };

  if (!isIntegrationHealthCheckEnabled()) {
    return empty;
  }

  const rows = await listActiveByProviderServiceRole(PROVIDER, input.limit);

  const result: SlackHealthCheckResult = { ...empty, enabled: true };

  // Bounded-concurrency fan-out, mirroring the trigger crons. One row's failure
  // is isolated by per-row try/catch inside checkOne + allSettled here.
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((row) => checkOne(row)));
    for (const s of settled) {
      result.checked += 1;
      if (s.status === "rejected") {
        // checkOne is designed not to throw; a rejection is still safe — count
        // it as an error and never mark.
        result.errors += 1;
        continue;
      }
      const r = s.value;
      switch (r.outcome) {
        case "healthy":
          result.healthy += 1;
          if (r.cleared) result.cleared += 1;
          break;
        case "authFailed":
          result.authFailed += 1;
          if (r.newlyMarked) result.markedNeedsReconnect += 1;
          break;
        case "skipped":
          result.skipped += 1;
          break;
        case "errors":
          result.errors += 1;
          break;
      }
    }
  }

  return result;
}
