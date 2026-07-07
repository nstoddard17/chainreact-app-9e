import {
  listRefreshDueServiceRole,
  type RefreshDueRow,
} from "@/repositories/integrationsRefresh";
import {
  getByIdForAccountServiceRole,
  markNeedsReconnect,
} from "@/repositories/integrations";
import { getProvider } from "@/integrations/_registry";
import { isPersonalCredentialProvider } from "@/core/integrations/credentialSharing";
import { refreshWithClaim } from "@/services/oauth/refreshWithClaim";
import { notifyReconnectNeeded } from "@/services/integrations/reconnectNotification";
import {
  RefreshAuthRequiredError,
  RefreshNotSupportedError,
} from "@/contracts/integration";
import { AccountFrozenError } from "@/services/accounts/accountFreeze";

/**
 * Phase 8 / OAUTH-REFRESH-RELIABILITY-1 — proactive OAuth token refresh sweep.
 *
 * WHY THIS EXISTS: until this slice, EVERY token refresh was reactive (a
 * provider call 401s → `refreshAndRetry`). Access tokens therefore sat expired
 * at rest after any idle period (Google/Microsoft/Asana/Monday ≈ 1 h, Calendly
 * 2 h), so every burst of activity began with simultaneous 401s across
 * serverless instances — the collision window that kills single-use rotating
 * refresh tokens. This sweep refreshes refreshable rows BEFORE expiry so the
 * reactive path becomes the rare exception, and workflows always start with a
 * live token. Audit: docs/slices/phase-8/oauth-refresh-reliability-audit.md.
 *
 * CLASSIFICATION (conservative — never cry wolf, never hide):
 *   - Manifest `refreshable: false` (Slack / Notion / GitHub / Facebook / ...)
 *       → skippedNonRefreshable. NEVER marked — non-refreshable by design is
 *       not a failure. (Most such providers have no expiry and never even
 *       match the due query; Facebook's 60-day expiring token does.)
 *   - Refreshable but NO stored refresh token → skippedNoRefreshToken. Only
 *       when the access token is ALREADY EXPIRED is this a durable dead end
 *       (nothing can ever refresh it) → mark needs_reconnect one-shot +
 *       notify the connector once. A merely expiring-soon row is counted and
 *       left alone.
 *   - Refresh succeeds → refreshed. Token columns updated by the dispatcher;
 *       rotating refresh tokens persisted; preserve-old providers keep the
 *       prior refresh token (provider modules own that policy).
 *   - `RefreshAuthRequiredError` (invalid_grant: revoked / expired grant /
 *       consent withdrawn) → actionRequired. The DISPATCHER already marked
 *       needs_reconnect + notified once (V2-READY-32); the row leaves future
 *       sweeps via the `needs_reconnect_at IS NULL` selection filter.
 *   - `RefreshNotSupportedError` despite `refreshable: true` → counted
 *       skippedNonRefreshable + loud mismatch log. NEVER silently re-classified.
 *   - `AccountFrozenError` (pending deletion) → skippedFrozen.
 *   - Anything else (provider 5xx / network / timeout / claim-lost wait
 *       budget) → failed. TRANSIENT: no mark, no token touched; the row is
 *       still due next tick and is retried.
 *
 * NO-LEAK: returns ONLY numeric aggregate counts. Per-row logs carry event +
 * integration id + provider + error category — never a token, refresh token,
 * auth header, provider response body, email, or scope list.
 *
 * IDEMPOTENT + SAFE TO RE-RUN: refresh is guarded by the cross-instance claim
 * (`refreshWithClaim`), marks are one-shot conditional UPDATEs, and a row
 * refreshed by a concurrent reactive caller simply yields "peer refreshed —
 * reuse" inside the wrapper. One row's failure never aborts the batch.
 */

const WINDOW_MINUTES_DEFAULT = 30;

/** Bounded concurrency — mirrors slackHealthCheck / the trigger crons. */
const CONCURRENCY = 5;

/** Aggregate, numbers only. Safe to log + return to the cron monitor. */
export interface TokenRefreshSweepResult {
  /** Rows matching the due query this tick (bounded by limit). */
  due: number;
  /** Rows actually processed (= due; kept separate for response-shape clarity). */
  scanned: number;
  /** Provider refresh succeeded; token columns updated. */
  refreshed: number;
  /** Manifest says non-refreshable (or module threw RefreshNotSupported). */
  skippedNonRefreshable: number;
  /** Refreshable provider but no stored refresh token. */
  skippedNoRefreshToken: number;
  /** Durable auth-dead outcomes (invalid_grant, or expired with no refresh token). */
  actionRequired: number;
  /** Subset of actionRequired newly marked BY THIS SWEEP (expired-no-token
   * one-shot marks; invalid_grant marks are owned by the dispatcher). */
  markedNeedsReconnect: number;
  /** Account pending deletion — refresh-for-use is blocked; not a failure. */
  skippedFrozen: number;
  /** Transient errors (5xx / network / claim wait budget) — retried next tick. */
  failed: number;
}

export interface TokenRefreshSweepInput {
  /** Max due rows to process this tick. */
  limit: number;
  /** Refresh rows expiring within this many minutes (default 30). */
  windowMinutes?: number;
}

type RowOutcome =
  | "refreshed"
  | "skippedNonRefreshable"
  | "skippedNoRefreshToken"
  | "actionRequired"
  | "skippedFrozen"
  | "failed";

interface RowResult {
  outcome: RowOutcome;
  /** True when THIS sweep performed the one-shot needs_reconnect mark. */
  newlyMarked: boolean;
}

/** Sanitized per-row log: event + row id + provider + (non-secret) category. */
function logRow(
  event: string,
  row: RefreshDueRow,
  category: string | null,
): void {
  console.warn(
    JSON.stringify(
      category === null
        ? { event, integrationId: row.id, provider: row.provider }
        : { event, integrationId: row.id, provider: row.provider, category },
    ),
  );
}

async function refreshOne(row: RefreshDueRow, nowMs: number): Promise<RowResult> {
  const manifest = getProvider(row.provider);
  if (!manifest || manifest.refreshable !== true) {
    // Non-refreshable by design (or unknown provider) — honest skip, no mark.
    return { outcome: "skippedNonRefreshable", newlyMarked: false };
  }

  if (!row.hasRefreshToken) {
    const alreadyExpired = Date.parse(row.accessTokenExpiresAt) <= nowMs;
    if (!alreadyExpired) {
      // Expiring soon but nothing to refresh with — count only; the reactive
      // path (and this sweep next tick, once expired) owns the durable verdict.
      return { outcome: "skippedNoRefreshToken", newlyMarked: false };
    }
    // Refreshable provider, token EXPIRED, no refresh token stored: durable —
    // nothing can ever refresh it. Mark one-shot + notify the connector once.
    logRow("token_refresh.no_refresh_token_expired", row, null);
    try {
      const firstMark = await markNeedsReconnect(row.id);
      if (firstMark) {
        const record = await getByIdForAccountServiceRole(row.accountId, row.id);
        if (record) await notifyReconnectNeeded(record);
      }
      return { outcome: "actionRequired", newlyMarked: firstMark };
    } catch {
      // Mark/notify failure is not a refresh failure — count as transient.
      return { outcome: "failed", newlyMarked: false };
    }
  }

  try {
    await refreshWithClaim({
      accountId: row.accountId,
      provider: row.provider,
      providerAccountId: row.providerAccountId,
      // Personal-credential rows pin to their connector so the claim/lock key
      // matches the reactive path's key exactly (account providers stay unpinned,
      // also matching refreshAndRetry).
      connectedByUserId: isPersonalCredentialProvider(row.provider)
        ? row.connectedByUserId
        : null,
    });
    return { outcome: "refreshed", newlyMarked: false };
  } catch (err) {
    if (err instanceof RefreshAuthRequiredError) {
      // Dead grant. The dispatcher already marked needs_reconnect + notified
      // once before re-throwing (V2-READY-32) — never marked again here.
      logRow("token_refresh.auth_dead", row, "invalid_grant");
      return { outcome: "actionRequired", newlyMarked: false };
    }
    if (err instanceof RefreshNotSupportedError) {
      // Manifest/module mismatch — the manifest says refreshable but the OAuth
      // module refuses. Loud log; honest count; NEVER silently re-classified.
      logRow("token_refresh.manifest_module_mismatch", row, "refresh_not_supported");
      return { outcome: "skippedNonRefreshable", newlyMarked: false };
    }
    if (err instanceof AccountFrozenError) {
      return { outcome: "skippedFrozen", newlyMarked: false };
    }
    // Transient (provider 5xx / network / timeout / claim wait budget) — no
    // state change; the row is still due next tick.
    logRow("token_refresh.transient_failure", row, "transient");
    return { outcome: "failed", newlyMarked: false };
  }
}

export async function runTokenRefreshSweep(
  input: TokenRefreshSweepInput,
): Promise<TokenRefreshSweepResult> {
  const windowMinutes = input.windowMinutes ?? WINDOW_MINUTES_DEFAULT;
  const nowMs = Date.now();
  const dueBeforeIso = new Date(nowMs + windowMinutes * 60_000).toISOString();

  const rows = await listRefreshDueServiceRole({ dueBeforeIso, limit: input.limit });

  const result: TokenRefreshSweepResult = {
    due: rows.length,
    scanned: 0,
    refreshed: 0,
    skippedNonRefreshable: 0,
    skippedNoRefreshToken: 0,
    actionRequired: 0,
    markedNeedsReconnect: 0,
    skippedFrozen: 0,
    failed: 0,
  };

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((row) => refreshOne(row, nowMs)),
    );
    for (const s of settled) {
      result.scanned += 1;
      if (s.status === "rejected") {
        // refreshOne is designed not to throw; a rejection is still safe —
        // transient, never marks.
        result.failed += 1;
        continue;
      }
      result[s.value.outcome] += 1;
      if (s.value.newlyMarked) result.markedNeedsReconnect += 1;
    }
  }

  return result;
}
