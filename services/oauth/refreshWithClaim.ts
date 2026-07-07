import { randomUUID } from "node:crypto";
import {
  getActiveForExecution,
  getByIdForAccountServiceRole,
  type IntegrationRecord,
} from "@/repositories/integrations";
import { claimRefresh, releaseRefreshClaim } from "@/repositories/integrationsRefresh";
import {
  refresh as dispatcherRefresh,
  type RefreshInput,
  type RefreshOutput,
} from "@/services/oauth/dispatcher";
import { refreshLockKey, withRefreshLock } from "./refreshLock";

/**
 * Cross-instance single-flight wrapper around the dispatcher's `refresh`
 * (Phase 8 / OAUTH-REFRESH-RELIABILITY-1).
 *
 * WHY: `services/oauth/refreshLock.ts` coalesces concurrent refreshes only
 * WITHIN one Node process. Production runs on Vercel serverless — concurrent
 * 401s handled on different instances (or the refresh cron racing a live run)
 * each call the provider's refresh endpoint. For providers with SINGLE-USE
 * ROTATING refresh tokens (Airtable, Calendly, Typeform; Microsoft rotates
 * too) a double refresh kills the grant server-side (`invalid_grant`) or lets
 * a stale loser overwrite the winner's rotated refresh token — the recurring
 * "reconnect needed" failure the Phase 8 audit confirmed
 * (docs/slices/phase-8/oauth-refresh-reliability-audit.md).
 *
 * HOW: before the provider call, take a short-lived DB claim on the exact row
 * (`refresh_claim_id` + `refresh_claimed_at`, conditional UPDATE — exactly one
 * claimer wins across instances). The winner runs the normal dispatcher
 * refresh and releases the claim. A loser does NOT call the provider: it
 * briefly polls the row and, when the winner's new access token lands, returns
 * the refreshed row — same contract as the in-process lock's "waiters share
 * the result". If the peer never finishes (crash), the claim TTL (60 s) makes
 * the row claimable again and THIS attempt fails transiently (callers map it
 * to a retryable failure; nothing is marked, no token is touched).
 *
 * CALLERS: `services/oauth/refreshAndRetry.ts` (the only reactive refresh
 * entry point — verified sole importer of dispatcher `refresh`) and
 * `services/integrations/tokenRefreshSweep.ts` (the proactive cron). Every
 * refresh in the product flows through here.
 *
 * Rows that will NOT reach the provider (missing row, no stored refresh
 * token, non-refreshable provider module) are delegated straight to the
 * dispatcher WITHOUT claiming, so every error shape and classification the
 * dispatcher already owns (RefreshNotSupportedError, RefreshAuthRequiredError
 * marking, freeze guard) is preserved verbatim.
 *
 * In-process coalescing is preserved by wrapping the whole claim+refresh in
 * `withRefreshLock` under a DISTINCT `claim:`-prefixed key (the dispatcher's
 * inner lock uses the bare key; `withRefreshLock` is not re-entrant).
 */

/** Claim older than this is stealable — protects against a crashed holder. */
export const REFRESH_CLAIM_TTL_MS = 60_000;

/** Peer-wait poll schedule: 4 × 750 ms ≈ 3 s, comfortably past a typical
 * provider token exchange. */
const PEER_WAIT_ATTEMPTS = 4;
const PEER_WAIT_INTERVAL_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll the row until the peer's refresh lands (access token ciphertext
 * changes) or attempts run out. Returns the refreshed record, or null when
 * the peer never finished / the row disappeared or disconnected.
 */
async function waitForPeerRefresh(
  accountId: string,
  integrationId: string,
  accessTokenEncryptedBefore: string,
): Promise<IntegrationRecord | null> {
  for (let attempt = 0; attempt < PEER_WAIT_ATTEMPTS; attempt++) {
    await sleep(PEER_WAIT_INTERVAL_MS);
    const row = await getByIdForAccountServiceRole(accountId, integrationId);
    if (!row || row.disconnectedAt !== null) return null;
    if (row.accessTokenEncrypted !== accessTokenEncryptedBefore) return row;
  }
  return null;
}

export async function refreshWithClaim(input: RefreshInput): Promise<RefreshOutput> {
  if (!input.accountId) throw new Error("refreshWithClaim: accountId is required.");
  const providerAccountId = input.providerAccountId ?? null;
  const connectedByUserId = input.connectedByUserId ?? null;

  const lockKey = `claim:${refreshLockKey({
    accountId: input.accountId,
    provider: input.provider,
    providerAccountId,
    connectedByUserId,
  })}`;

  return withRefreshLock(lockKey, async () => {
    const row = await getActiveForExecution(
      input.accountId,
      input.provider,
      providerAccountId,
      connectedByUserId != null ? { connectedByUserId } : undefined,
    );
    // Missing row / no refresh token: no provider call will happen — delegate
    // so the dispatcher throws its canonical errors unchanged.
    if (!row || !row.refreshTokenEncrypted) {
      return dispatcherRefresh(input);
    }

    const claimId = randomUUID();
    const claimed = await claimRefresh({
      integrationId: row.id,
      claimId,
      staleBeforeIso: new Date(Date.now() - REFRESH_CLAIM_TTL_MS).toISOString(),
    });

    if (!claimed) {
      // Another instance is refreshing this row. Never call the provider —
      // reuse the peer's result once it lands.
      const refreshed = await waitForPeerRefresh(
        row.accountId,
        row.id,
        row.accessTokenEncrypted,
      );
      if (refreshed) return { integration: refreshed };
      // Peer never finished within the wait budget. Transient by design:
      // callers treat this as a retryable refresh failure; nothing is marked
      // and no token is touched. The claim TTL un-wedges the row.
      throw new Error(
        `refreshWithClaim: another refresh is in progress for integration ${row.id}; retry shortly.`,
      );
    }

    try {
      return await dispatcherRefresh(input);
    } finally {
      // Best-effort — a release failure only delays the next claim by the TTL.
      try {
        await releaseRefreshClaim({ integrationId: row.id, claimId });
      } catch {
        // swallow — the refresh outcome (success or the original error) wins.
      }
    }
  });
}
